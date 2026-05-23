// src/app/api/reservations/[id]/release/route.ts
//
// Releases a pending reservation early (user cancelled / payment failed).
// Idempotent: releasing an already-released reservation returns 200.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = params;
  const idempotencyKey = req.headers.get("Idempotency-Key");

  return withIdempotency(idempotencyKey, async () => {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.findUnique({ where: { id } });

        if (!reservation) {
          throw Object.assign(new Error("Reservation not found"), { status: 404 });
        }

        // Idempotent: already released
        if (reservation.status === "RELEASED") {
          return reservation;
        }

        if (reservation.status === "CONFIRMED") {
          throw Object.assign(
            new Error("Cannot release a confirmed reservation"),
            { status: 409 }
          );
        }

        // Return the held units to the pool
        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reserved: { decrement: reservation.quantity } },
        });

        return tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });
      });

      return NextResponse.json({
        id: result.id,
        productId: result.productId,
        warehouseId: result.warehouseId,
        quantity: result.quantity,
        status: result.status,
        expiresAt: result.expiresAt.toISOString(),
        createdAt: result.createdAt.toISOString(),
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e.status === 409) return NextResponse.json({ error: e.message }, { status: 409 });
      console.error("[POST /api/reservations/:id/release]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}
