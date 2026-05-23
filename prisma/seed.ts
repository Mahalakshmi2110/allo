// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // Wipe in dependency order
  await prisma.idempotencyRecord.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // ── Warehouses ──────────────────────────────────────────────────────────
  const [mumbai, delhi, bangalore] = await Promise.all([
    prisma.warehouse.create({ data: { name: "Mumbai Hub", city: "Mumbai" } }),
    prisma.warehouse.create({ data: { name: "Delhi North", city: "Delhi" } }),
    prisma.warehouse.create({ data: { name: "Bangalore South", city: "Bangalore" } }),
  ]);

  // ── Products + stock ────────────────────────────────────────────────────
  const products = [
    {
      name: "Merino Wool Crew",
      sku: "MWC-001",
      pricePaise: 8900_00,
      imageEmoji: "🧥",
      stocks: [
        { warehouseId: mumbai.id, total: 3 },
        { warehouseId: delhi.id, total: 2 },
      ],
    },
    {
      name: "Leather Crossbody",
      sku: "LCB-002",
      pricePaise: 12400_00,
      imageEmoji: "👜",
      stocks: [
        { warehouseId: mumbai.id, total: 1 },
        { warehouseId: bangalore.id, total: 4 },
      ],
    },
    {
      name: "Slim Chino Pants",
      sku: "SCP-003",
      pricePaise: 4500_00,
      imageEmoji: "👖",
      stocks: [
        { warehouseId: delhi.id, total: 0 },
        { warehouseId: bangalore.id, total: 2 },
      ],
    },
    {
      name: "Canvas Sneakers",
      sku: "CNS-004",
      pricePaise: 3200_00,
      imageEmoji: "👟",
      stocks: [
        { warehouseId: mumbai.id, total: 5 },
        { warehouseId: delhi.id, total: 3 },
        { warehouseId: bangalore.id, total: 1 },
      ],
    },
  ];

  for (const { stocks, ...productData } of products) {
    const product = await prisma.product.create({ data: productData });
    await prisma.stock.createMany({
      data: stocks.map((s) => ({
        productId: product.id,
        warehouseId: s.warehouseId,
        total: s.total,
        reserved: 0,
      })),
    });
  }

  console.log("✅ Done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
