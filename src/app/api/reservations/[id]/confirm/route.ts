// src/app/api/reservations/[id]/confirm/route.ts
//
// Confirms a pending reservation (payment succeeded).
// Returns 410 Gone if the reservation has expired.
// Idempotent: confirming an already-confirmed reservation returns 200.

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

        // Idempotent success: already confirmed
        if (reservation.status === "CONFIRMED") {
          return reservation;
        }

        if (reservation.status === "RELEASED") {
          throw Object.assign(
            new Error("Reservation has already been released"),
            { status: 409 }
          );
        }

        // Check expiry
        if (reservation.expiresAt < new Date()) {
          // Release the held stock before returning 410
          await tx.stock.update({
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
            data: { reserved: { decrement: reservation.quantity } },
          });
          await tx.reservation.update({
            where: { id },
            data: { status: "RELEASED" },
          });
          throw Object.assign(new Error("Reservation has expired"), { status: 410 });
        }

        // Confirm: decrement both total and reserved (unit is now "sold")
        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: {
            total: { decrement: reservation.quantity },
            reserved: { decrement: reservation.quantity },
          },
        });

        return tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED" },
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
      if (e.status === 410) return NextResponse.json({ error: e.message }, { status: 410 });
      console.error("[POST /api/reservations/:id/confirm]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}
