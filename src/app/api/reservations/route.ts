// src/app/api/reservations/route.ts
//
// ── Concurrency strategy ─────────────────────────────────────────────────
//
// We use a Postgres transaction with a pessimistic row-level lock (`FOR UPDATE`).
//
// Flow inside the transaction:
//   1. SELECT … FOR UPDATE on the stock row — this acquires an exclusive lock.
//      Any concurrent request for the same (productId, warehouseId) will block
//      at this line until the first transaction commits or rolls back.
//   2. Compute available = total - reserved. If < quantity → 409.
//   3. Increment reserved and INSERT the reservation atomically.
//
// Because Postgres serialises all concurrent writes to the same stock row,
// exactly one request wins when there's only one unit left. The loser always
// sees the updated `reserved` count and gets 409.
//
// Alternative considered: optimistic locking (version column + retry).
// Rejected because under high contention it generates many retries and still
// needs a database round-trip. FOR UPDATE is simpler and predictable here.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { CreateReservationSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const RESERVATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get("Idempotency-Key");

  return withIdempotency(idempotencyKey, async () => {
    // ── Parse & validate ─────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // ── Atomic reserve ───────────────────────────────────────────────────
    try {
      const reservation = await prisma.$transaction(async (tx) => {
        // Pessimistic lock — serialises concurrent writes to this stock row.
        // Raw query because Prisma's typed API doesn't expose FOR UPDATE.
        const rows = await tx.$queryRaw<
          { total: number; reserved: number }[]
        >`
          SELECT total, reserved
          FROM "Stock"
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw Object.assign(new Error("Stock row not found"), { status: 404 });
        }

        const { total, reserved } = rows[0];
        const available = total - reserved;

        if (available < quantity) {
          throw Object.assign(
            new Error(`Only ${available} unit(s) available`),
            { status: 409 }
          );
        }

        // Increment reserved
        await tx.stock.update({
          where: { productId_warehouseId: { productId, warehouseId } },
          data: { reserved: { increment: quantity } },
        });

        // Create reservation record
        return tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt: new Date(Date.now() + RESERVATION_WINDOW_MS),
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        });
      });

      return NextResponse.json(
        {
          id: reservation.id,
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
          quantity: reservation.quantity,
          status: reservation.status,
          expiresAt: reservation.expiresAt.toISOString(),
          createdAt: reservation.createdAt.toISOString(),
        },
        { status: 201 }
      );
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) {
        return NextResponse.json({ error: e.message }, { status: 404 });
      }
      if (e.status === 409) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      console.error("[POST /api/reservations]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}
