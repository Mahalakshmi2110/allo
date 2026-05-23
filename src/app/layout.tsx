// src/app/layout.tsx
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Inventory",
  description: "Multi-warehouse inventory reservation platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-950 text-stone-100 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
