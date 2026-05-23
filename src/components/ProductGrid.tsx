"use client";
// src/components/ProductGrid.tsx
// Displays products with per-warehouse stock and Reserve buttons.
// Periodically re-fetches to keep stock counts fresh.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductWithStock } from "@/types";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/use-toast";

type Props = { initialProducts: ProductWithStock[] };

const POLL_INTERVAL_MS = 15_000; // refresh every 15 s

export function ProductGrid({ initialProducts }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductWithStock[]>(initialProducts);
  const [reservingKey, setReservingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Polling ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (res.ok) setProducts(await res.json());
    } catch {
      // silent — stale data is acceptable
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => startTransition(refresh), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // ── Reserve ──────────────────────────────────────────────────────────────
  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}::${warehouseId}`;
    setReservingKey(key);

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast({
          title: "Not enough stock",
          description: data.error,
          variant: "destructive",
        });
        await refresh();
        return;
      }

      if (!res.ok) {
        toast({
          title: "Something went wrong",
          description: data.error ?? "Unknown error",
          variant: "destructive",
        });
        return;
      }

      // Navigate to checkout
      router.push(`/checkout/${data.id}`);
    } finally {
      setReservingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {isPending && (
        <p className="text-xs text-stone-600 font-mono animate-pulse">Refreshing stock…</p>
      )}
      {products.map((product) => (
        <article
          key={product.id}
          className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden"
        >
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-stone-800 rounded-lg flex items-center justify-center text-3xl flex-shrink-0">
                {product.imageEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-stone-100 font-display text-lg leading-tight">
                    {product.name}
                  </h2>
                  <span className="text-stone-300 font-bold text-sm font-mono whitespace-nowrap">
                    {formatPrice(product.pricePaise)}
                  </span>
                </div>
                <p className="text-stone-600 text-xs mt-0.5 font-mono">SKU {product.sku}</p>
              </div>
            </div>

            {/* Stock per warehouse */}
            <div className="mt-4 space-y-2">
              {product.warehouses.map((wh) => {
                const key = `${product.id}::${wh.warehouseId}`;
                const isReserving = reservingKey === key;
                return (
                  <div
                    key={wh.warehouseId}
                    className="flex items-center justify-between bg-stone-950 rounded-lg px-4 py-2.5 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-stone-400 text-sm truncate">{wh.warehouseName}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {wh.available > 0 ? (
                          <Badge variant="success">{wh.available} available</Badge>
                        ) : (
                          <Badge variant="danger">Out of stock</Badge>
                        )}
                        {wh.reserved > 0 && (
                          <Badge variant="warning">{wh.reserved} held</Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleReserve(product.id, wh.warehouseId)}
                      disabled={wh.available === 0 || !!reservingKey}
                      aria-busy={isReserving}
                      className={[
                        "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all",
                        wh.available > 0 && !reservingKey
                          ? "bg-stone-100 text-stone-900 hover:bg-white"
                          : "bg-stone-800 text-stone-600 cursor-not-allowed",
                      ].join(" ")}
                    >
                      {isReserving ? "…" : wh.available > 0 ? "Reserve" : "Sold out"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
