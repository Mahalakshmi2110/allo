// src/lib/schemas.ts
// Single source of truth for request/response shapes.
// Imported by both API route handlers and client-side fetch wrappers.

import { z } from "zod";

// ── Request bodies ──────────────────────────────────────────────────────

export const CreateReservationSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// ── Response shapes ─────────────────────────────────────────────────────

export const ReservationResponseSchema = z.object({
  id: z.string(),
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.number(),
  status: z.enum(["PENDING", "CONFIRMED", "RELEASED"]),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const ProductResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string(),
  pricePaise: z.number(),
  imageEmoji: z.string(),
  warehouses: z.array(
    z.object({
      warehouseId: z.string(),
      warehouseName: z.string(),
      city: z.string(),
      total: z.number(),
      reserved: z.number(),
      available: z.number(),
    })
  ),
});

export const WarehouseResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
});
