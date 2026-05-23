// src/app/checkout/[id]/page.tsx
// Server Component that fetches the reservation, then renders the
// client-side CheckoutPanel which handles confirm/release + countdown.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

async function getReservation(id: string) {
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: true,
    },
  });
  if (!r) return null;

  // Lazy expiry
  if (r.status === "PENDING" && r.expiresAt < new Date()) {
    await prisma.$transaction([
      prisma.reservation.update({ where: { id }, data: { status: "RELEASED" } }),
      prisma.stock.update({
        where: {
          productId_warehouseId: { productId: r.productId, warehouseId: r.warehouseId },
        },
        data: { reserved: { decrement: r.quantity } },
      }),
    ]);
    return { ...r, status: "RELEASED" as const };
  }

  return r;
}

export default async function CheckoutPage({ params }: Props) {
  const reservation = await getReservation(params.id);
  if (!reservation) notFound();

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-stone-800 px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-4">
          <Link href="/" className="text-stone-500 hover:text-stone-300 transition-colors text-sm font-mono">
            ← Back
          </Link>
          <span className="text-stone-700">|</span>
          <span className="text-stone-400 text-sm font-mono">Checkout</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <CheckoutPanel
          reservation={{
            id: reservation.id,
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
            quantity: reservation.quantity,
            status: reservation.status as "PENDING" | "CONFIRMED" | "RELEASED",
            expiresAt: reservation.expiresAt.toISOString(),
            createdAt: reservation.createdAt.toISOString(),
            productName: reservation.product.name,
            productSku: reservation.product.sku,
            productImageEmoji: reservation.product.imageEmoji,
            pricePaise: reservation.product.pricePaise,
          }}
        />
      </main>
    </div>
  );
}
