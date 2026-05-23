// src/components/ui/Badge.tsx
import { clsx } from "clsx";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<Variant, string> = {
  default: "bg-stone-800 text-stone-300",
  success: "bg-emerald-950 text-emerald-400 border border-emerald-900",
  warning: "bg-amber-950 text-amber-400 border border-amber-900",
  danger: "bg-red-950 text-red-400 border border-red-900",
  info: "bg-blue-950 text-blue-400 border border-blue-900",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
