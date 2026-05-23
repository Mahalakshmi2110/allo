// src/app/api/reservations/[id]/route.ts
// Handles:
//   POST /api/reservations/:id/confirm
//   POST /api/reservations/:id/release
//
// Both are idempotency-safe: re-confirming a CONFIRMED reservation is a no-op
// (returns 200 with the existing record). Same for RELEASED.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// ── Shared helper ──────────────────────────────────────────────────────────

function serializeReservation(r: {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: r.id,
    productId: r.productId,
    warehouseId: r.warehouseId,
    quantity: r.quantity,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

// ── GET (fetch a single reservation, used by the checkout page) ────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = params;

  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  // Lazy expiry: if it's past the window, mark it released right now
  if (reservation.status === "PENDING" && reservation.expiresAt < new Date()) {
    await releaseStock(id, reservation.productId, reservation.warehouseId, reservation.quantity);
    return NextResponse.json(
      { ...serializeReservation(reservation), status: "RELEASED" },
      { status: 200 }
    );
  }

  return NextResponse.json(serializeReservation(reservation));
}

// ── Shared stock-release helper ────────────────────────────────────────────

async function releaseStock(
  id: string,
  productId: string,
  warehouseId: string,
  quantity: number
) {
  return prisma.$transaction([
    prisma.reservation.update({
      where: { id },
      data: { status: "RELEASED" },
    }),
    prisma.stock.update({
      where: { productId_warehouseId: { productId, warehouseId } },
      data: { reserved: { decrement: quantity } },
    }),
  ]);
}
