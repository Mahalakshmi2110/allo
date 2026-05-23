// src/app/api/products/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic"; // never cache; stock changes constantly

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const response = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      pricePaise: p.pricePaise,
      imageEmoji: p.imageEmoji,
      warehouses: p.stocks.map((s) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        city: s.warehouse.city,
        total: s.total,
        reserved: s.reserved,
        available: Math.max(0, s.total - s.reserved),
      })),
    }));

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
