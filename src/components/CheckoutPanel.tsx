"use client";
// src/components/CheckoutPanel.tsx
// Shows reservation details, live countdown, confirm/cancel buttons.
// Handles 410 (expired) and 409 (already actioned) errors explicitly.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/use-toast";

type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED";

interface Props {
  reservation: {
    id: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    status: ReservationStatus;
    expiresAt: string;
    createdAt: string;
    productName: string;
    productSku: string;
    productImageEmoji: string;
    pricePaise: number;
  };
}

const RESERVATION_WINDOW_MS = 10 * 60 * 1000;

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const expiresMs = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(expiresMs - Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => {
      const r = expiresMs - Date.now();
      setRemaining(r);
      if (r <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire();
      }
    }, 500);
    return () => clearInterval(tick);
  }, [expiresMs, onExpire]);

  const pct = Math.max(0, Math.min(100, (remaining / RESERVATION_WINDOW_MS) * 100));
  const urgent = remaining > 0 && remaining < 60_000;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 uppercase tracking-widest font-mono">
          Expires in
        </span>
        <span
          className={`text-3xl font-bold tabular-nums font-mono ${
            remaining <= 0 ? "text-red-500" : urgent ? "text-amber-400" : "text-stone-100"
          }`}
        >
          {remaining <= 0 ? "EXPIRED" : formatCountdown(remaining)}
        </span>
      </div>
      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            remaining <= 0 ? "bg-red-600" : urgent ? "bg-amber-400" : "bg-emerald-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CheckoutPanel({ reservation: initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [res, setRes] = useState(initial);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [localExpired, setLocalExpired] = useState(
    initial.status !== "PENDING" || new Date(initial.expiresAt) < new Date()
  );

  const isActive = res.status === "PENDING" && !localExpired;

  const handleExpire = useCallback(() => {
    setLocalExpired(true);
    setRes((r) => ({ ...r, status: "RELEASED" }));
    toast({
      title: "Reservation expired",
      description: "The hold was released automatically. You can reserve again.",
      variant: "destructive",
    });
  }, [toast]);

  const handleConfirm = async () => {
    setLoading("confirm");
    try {
      const res2 = await fetch(`/api/reservations/${res.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res2.json();

      if (res2.status === 410) {
        setLocalExpired(true);
        setRes((r) => ({ ...r, status: "RELEASED" }));
        toast({
          title: "Reservation expired",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (!res2.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      setRes((r) => ({ ...r, status: "CONFIRMED" }));
      toast({ title: "Purchase confirmed!", description: "Your order is placed." });
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    setLoading("cancel");
    try {
      const res2 = await fetch(`/api/reservations/${res.id}/release`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res2.json();

      if (!res2.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      setRes((r) => ({ ...r, status: "RELEASED" }));
      toast({ title: "Cancelled", description: "Stock returned to pool." });
      router.push("/");
    } finally {
      setLoading(null);
    }
  };

  const statusVariant = (s: ReservationStatus) => {
    if (s === "CONFIRMED") return "success";
    if (s === "RELEASED") return "danger";
    return "warning";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-100 font-display">Checkout</h1>
        <p className="text-stone-500 mt-1 text-sm">
          Complete your purchase before the reservation expires.
        </p>
      </div>

      <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-6">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-500 uppercase tracking-widest font-mono">
            Reservation
          </span>
          <Badge variant={statusVariant(res.status)}>{res.status}</Badge>
        </div>

        {/* Product summary */}
        <div className="flex items-center gap-4 bg-stone-950 rounded-lg p-4">
          <div className="w-12 h-12 bg-stone-800 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
            {res.productImageEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-stone-100 font-display">{res.productName}</p>
            <p className="text-stone-600 text-xs font-mono mt-0.5">SKU {res.productSku}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-stone-200 font-mono">{formatPrice(res.pricePaise)}</p>
            <p className="text-stone-600 text-xs">× {res.quantity}</p>
          </div>
        </div>

        {/* Detail rows */}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["Reservation ID", <span key="id" className="font-mono text-xs text-stone-500">{res.id}</span>],
            ["Quantity", res.quantity],
            ["Created", new Date(res.createdAt).toLocaleTimeString()],
          ].map(([label, value]) => (
            <div key={String(label)} className="contents">
              <dt className="text-stone-500">{label}</dt>
              <dd className="text-stone-200 text-right">{value as React.ReactNode}</dd>
            </div>
          ))}
        </dl>

        {/* Countdown */}
        {res.status === "PENDING" && (
          <CountdownTimer expiresAt={res.expiresAt} onExpire={handleExpire} />
        )}

        {/* Terminal state banners */}
        {res.status === "CONFIRMED" && (
          <div className="bg-emerald-950 border border-emerald-900 rounded-lg p-4 text-sm text-emerald-300">
            ✓ Purchase confirmed. This unit has been permanently decremented from inventory.
          </div>
        )}
        {(res.status === "RELEASED" || localExpired) && (
          <div className="bg-red-950 border border-red-900 rounded-lg p-4 text-sm text-red-300">
            This reservation has expired or been released. The stock has been returned to the pool.
          </div>
        )}

        {/* Action buttons */}
        {isActive && (
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleConfirm}
              disabled={!!loading}
              className="flex-1 bg-stone-100 hover:bg-white text-stone-900 font-semibold py-3 rounded-xl text-sm font-mono transition-colors disabled:opacity-50"
            >
              {loading === "confirm" ? "Processing…" : "Confirm purchase"}
            </button>
            <button
              onClick={handleCancel}
              disabled={!!loading}
              className="px-5 py-3 rounded-xl border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 text-sm font-mono transition-colors disabled:opacity-50"
            >
              {loading === "cancel" ? "…" : "Cancel"}
            </button>
          </div>
        )}

        {!isActive && (
          <button
            onClick={() => router.push("/")}
            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-300 py-3 rounded-xl text-sm font-mono transition-colors"
          >
            ← Return to products
          </button>
        )}
      </div>
    </div>
  );
}
