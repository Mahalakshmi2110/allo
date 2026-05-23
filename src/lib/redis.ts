// src/lib/redis.ts
// Upstash Redis via ioredis. The REDIS_URL env var is in the form:
//   rediss://:password@host:port
// Falls back gracefully when Redis is unavailable (idempotency becomes best-effort).

import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createClient() {
  if (!process.env.REDIS_URL) {
    console.warn("[redis] REDIS_URL not set — idempotency cache disabled");
    return null;
  }
  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
  client.on("error", (err) => console.error("[redis]", err.message));
  return client;
}

export const redis: Redis | null =
  globalForRedis.redis ?? createClient();

if (redis && process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
