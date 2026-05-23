"use client";
// src/components/ui/toaster.tsx + use-toast.tsx
// Minimal toast system — avoids a heavy dependency for this exercise.
// In production, swap for Radix Toast or react-hot-toast.

import { createContext, useCallback, useContext, useState } from "react";

type Variant = "default" | "destructive";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: Variant;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((opts: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...opts, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "rounded-xl border px-4 py-3 shadow-xl text-sm animate-in slide-in-from-bottom-2",
              t.variant === "destructive"
                ? "bg-red-950 border-red-800 text-red-200"
                : "bg-stone-800 border-stone-700 text-stone-100",
            ].join(" ")}
          >
            <p className="font-semibold">{t.title}</p>
            {t.description && (
              <p className="text-xs mt-0.5 opacity-80">{t.description}</p>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// Re-exported as Toaster for layout.tsx
export function Toaster() {
  return null; // Toasting is handled by ToastProvider above
}
