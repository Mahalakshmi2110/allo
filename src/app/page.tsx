// src/app/page.tsx
// Server Component — fetches products on every request (no caching).
// Client interactivity is isolated in <ProductGrid />.

import { ProductGrid } from "@/components/ProductGrid";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getProducts() {
  const products = await prisma.product.findMany({
    include: { stocks: { include: { warehouse: true } } },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
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
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-stone-800 px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-stone-100 rounded-md flex items-center justify-center">
              <span className="text-stone-900 text-xs font-bold font-mono">A</span>
            </div>
            <span className="font-semibold text-stone-100 font-display text-lg">Allo</span>
          </div>
          <span className="text-xs text-stone-600 font-mono">Inventory Platform</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100 font-display">Products</h1>
          <p className="text-stone-500 mt-1 text-sm">
            Live stock across all warehouses. Reserve a unit to hold it for 10 minutes.
          </p>
        </div>
        <ProductGrid initialProducts={products} />
      </main>
    </div>
  );
}
