// src/app/api/cron/release-expired/route.ts
//
// Runs every minute via Vercel Cron (see vercel.json).
// Finds all PENDING reservations past their expiresAt and releases them in a
// single transaction so stock is always consistent with reservation status.
//
// Security: Vercel signs cron requests with CRON_SECRET. Any other caller
// gets 401. In local dev, set CRON_SECRET=dev and call with:
//   curl -H "Authorization: Bearer dev" http://localhost:3000/api/cron/release-expired

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel Pro allows up to 300

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    // Find expired pending reservations
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    if (expired.length === 0) {
      return NextResponse.json({ released: 0, message: "Nothing to release" });
    }

    // Release all in one transaction
    await prisma.$transaction(async (tx) => {
      // Bulk-update reservation statuses
      await tx.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data: { status: "RELEASED" },
      });

      // Return units to stock — group by (productId, warehouseId) to avoid
      // multiple updates to the same row within the same transaction
      const grouped = new Map<string, { productId: string; warehouseId: string; quantity: number }>();
      for (const r of expired) {
        const key = `${r.productId}::${r.warehouseId}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.quantity += r.quantity;
        } else {
          grouped.set(key, { productId: r.productId, warehouseId: r.warehouseId, quantity: r.quantity });
        }
      }

      for (const { productId, warehouseId, quantity } of Array.from(grouped.values())) {
        await tx.stock.update({
          where: { productId_warehouseId: { productId, warehouseId } },
          data: { reserved: { decrement: quantity } },
        });
      }
    });

    console.log(`[cron] Released ${expired.length} expired reservation(s)`);
    return NextResponse.json({ released: expired.length });
  } catch (err) {
    console.error("[cron/release-expired]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
