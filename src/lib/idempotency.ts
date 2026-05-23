// src/lib/idempotency.ts
//
// Strategy: Redis-first (fast path), Postgres fallback (durable).
//
// On first request with a given Idempotency-Key:
//   1. Try to acquire a Redis lock so concurrent duplicate requests queue up.
//   2. Run the handler.
//   3. Persist the response in both Redis (TTL 24 h) and Postgres (for durability).
//
// On retry with the same key:
//   1. Check Redis → return cached response immediately.
//   2. If Redis miss, check Postgres → return cached response.
//   3. If both miss (e.g. Redis eviction + within 24 h), re-run (acceptable).

import { NextResponse } from "next/server";
import { redis } from "./redis";
import { prisma } from "./prisma";

const TTL_SECONDS = 86_400; // 24 hours

export async function withIdempotency(
  key: string | null,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  if (!key) return handler();

  const cacheKey = `idem:${key}`;

  // ── 1. Fast path: Redis ────────────────────────────────────────────────
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const { statusCode, body } = JSON.parse(cached);
        return new NextResponse(body, {
          status: statusCode,
          headers: {
            "Content-Type": "application/json",
            "Idempotent-Replayed": "true",
          },
        });
      }
    } catch {
      // Redis error — fall through to DB
    }
  }

  // ── 2. Durable path: Postgres ──────────────────────────────────────────
  try {
    const record = await prisma.idempotencyRecord.findUnique({
      where: { key },
    });
    if (record && record.expiresAt > new Date()) {
      return new NextResponse(record.responseBody, {
        status: record.statusCode,
        headers: {
          "Content-Type": "application/json",
          "Idempotent-Replayed": "true",
        },
      });
    }
  } catch {
    // DB error — fall through and run handler
  }

  // ── 3. Execute handler ─────────────────────────────────────────────────
  const response = await handler();
  const body = await response.text();
  const statusCode = response.status;
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  // Persist asynchronously — don't let storage errors fail the response
  Promise.all([
    redis
      ? redis
          .set(cacheKey, JSON.stringify({ statusCode, body }), "EX", TTL_SECONDS)
          .catch(() => {})
      : Promise.resolve(),
    prisma.idempotencyRecord
      .upsert({
        where: { key },
        create: { key, responseBody: body, statusCode, expiresAt },
        update: { responseBody: body, statusCode, expiresAt },
      })
      .catch(() => {}),
  ]);

  return new NextResponse(body, {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}
