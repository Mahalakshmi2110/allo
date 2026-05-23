// src/types/index.ts

export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED";

export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  city: string;
  total: number;
  reserved: number;
  available: number;
}

export interface ProductWithStock {
  id: string;
  name: string;
  sku: string;
  pricePaise: number;
  imageEmoji: string;
  warehouses: WarehouseStock[];
}

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string; // ISO string
  createdAt: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
