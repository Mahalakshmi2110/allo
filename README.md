# Allo Inventory — Take-Home Exercise

Multi-warehouse inventory reservation system built with Next.js 14 (App Router), Prisma, Postgres, and Redis.

---

## Running Locally

### Prerequisites

- Node.js 18+
- A hosted Postgres instance ([Neon](https://neon.tech) or [Supabase](https://supabase.com) free tier)
- A Redis instance ([Upstash](https://upstash.com) free tier) — optional but enables durable idempotency

### 1. Clone and install

```bash
git clone <repo>
cd allo
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, REDIS_URL, and CRON_SECRET
```

### 3. Apply schema and seed

```bash
npm run db:push      # push schema to Postgres (skips migration history, fine for dev)
npm run db:seed      # seeds 3 warehouses and 4 products
```

### 4. Start dev server

```bash
npm run dev
# → http://localhost:3001
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List products with per-warehouse stock |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Reserve units — 409 if insufficient stock |
| GET | `/api/reservations/:id` | Fetch a single reservation (with lazy expiry) |
| POST | `/api/reservations/:id/confirm` | Confirm reservation — 410 if expired |
| POST | `/api/reservations/:id/release` | Release reservation early |
| GET | `/api/cron/release-expired` | Cron endpoint (requires `Authorization: Bearer $CRON_SECRET`) |

All mutating endpoints accept an optional `Idempotency-Key` header.

---

## How Concurrency Is Handled

The core race condition is two simultaneous requests competing for the last unit of a SKU.

### Solution: Pessimistic row-level locking

Inside a Postgres transaction, we issue:

```sql
SELECT total, reserved
FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` acquires an exclusive lock on that stock row. Any concurrent transaction attempting the same lock blocks until the first commits or rolls back. This means:

1. Request A acquires the lock, sees `available = 1`, increments `reserved`.
2. Request B was waiting; it now sees `available = 0` and gets a 409.

**Why not optimistic locking?** Optimistic locking (version column + retry loop) works well when conflicts are rare. For inventory — where high-demand SKUs regularly have multiple simultaneous buyers — the retry overhead adds latency without simplifying the code. `FOR UPDATE` is a single round-trip and guaranteed serialised.

**Why not Redis atomic operations?** Redis `INCR`/`DECR` with a Lua script is a valid approach and would be lower latency. I chose Postgres locking because it keeps the truth in one place (the DB) and avoids a split-brain scenario where Redis and Postgres disagree.

---

## Reservation Expiry

### Production: Vercel Cron (every minute)

`vercel.json` schedules `GET /api/cron/release-expired` to run every minute. The handler:

1. Finds all `PENDING` reservations where `expiresAt < now`.
2. In a single transaction, bulk-updates them to `RELEASED` and decrements the corresponding stock rows (grouped by `(productId, warehouseId)` to avoid redundant updates).

The cron endpoint is authenticated with a `CRON_SECRET` bearer token. Set this in Vercel's environment variables panel with the same value as your local `.env.local`.

### Lazy cleanup on read

As a belt-and-suspenders measure, `GET /api/reservations/:id` and the server component that renders the checkout page both check `expiresAt` on load and mark the reservation `RELEASED` if it has passed. This means an expired reservation is never shown as active even if the cron job hasn't run yet.

### Local dev testing

```bash
curl -H "Authorization: Bearer dev" http://localhost:3001/api/cron/release-expired
```

---

## Idempotency

Both `POST /api/reservations` and the confirm/release endpoints accept an `Idempotency-Key: <uuid>` header.

### Strategy: Redis-first, Postgres fallback

```
Request with Idempotency-Key
        │
        ▼
  Redis GET idem:<key>  ─── hit ──→ return cached response
        │ miss
        ▼
  Postgres lookup        ─── hit ──→ return cached response
        │ miss
        ▼
  Run handler
        │
        ▼
  Write to Redis (TTL 24h) AND Postgres (async, non-blocking)
        │
        ▼
  Return response
```

Redis provides low-latency replay for the common case. Postgres provides durability — if Redis is evicted or restarts, we can still detect duplicates within the 24-hour window. Write failures to the stores are swallowed so that a cache write error never causes a user-visible failure.

The `idempotencyKey` is also stored on the `Reservation` row itself (unique constraint) as a last line of defence against database-level duplicates if two requests somehow both get past the cache checks.

---

## Trade-offs and What I'd Do Differently

### What I'd improve with more time

**Tests.** The concurrency logic especially deserves integration tests — ideally spinning up a real Postgres instance and firing concurrent requests with `Promise.all`. I'd use Vitest + a test database.

**Connection pooling.** Vercel's serverless functions create a new Postgres connection per invocation. PgBouncer (or Neon's built-in pooler / Supabase's pgbouncer) should be wired in via `?pgbouncer=true` on the connection string.

**Optimistic UI updates.** The product listing page re-fetches from the server after a reserve. A better UX would be to update the local state immediately (decrement the count) and revert on error — standard optimistic mutation pattern.

**Partial fulfilment.** Currently a reservation for `quantity > 1` will 409 if even one unit is missing. A production system would need per-unit tracking or at least a partial-fill option.

**Metrics and alerting.** I'd add structured logging (via Pino) and track `reservation.created`, `reservation.confirmed`, `reservation.expired` as events. High expiry rates are a signal that the checkout flow is too slow or the 10-minute window is too short.

**Cron reliability.** Vercel Cron is best-effort (not guaranteed delivery). For strict SLAs I'd pair it with a dead-letter check: any reservation still PENDING more than 15 minutes after `expiresAt` triggers a Slack alert for manual review.

### Deliberate simplifications

- No auth — a real system would tie reservations to a user session.
- No payment gateway integration — the "Confirm" button simulates what would happen after a successful payment webhook.
- Single quantity — the UI always reserves 1 unit; the API supports arbitrary quantities.
- No warehouse routing logic — in production you'd pick the nearest warehouse with stock automatically.
