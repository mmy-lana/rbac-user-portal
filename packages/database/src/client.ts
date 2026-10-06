import { neon, neonConfig, Pool, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  drizzle as drizzlePooled,
  type NeonDatabase,
} from 'drizzle-orm/neon-serverless';
import WebSocket from 'ws';
import * as schema from './schema/index';

/**
 * Neon serverless connection strategy.
 *
 * Two drivers are exposed on purpose:
 *
 * 1. `db` — HTTP driver (`neon-http`). Stateless, one-shot requests. Cheapest
 *    option for reads and single-statement writes that do not need a
 *    multi-statement transaction. This is the default handle for the app.
 * 2. `poolDb` — WebSocket driver (`neon-serverless`) backed by a `Pool`.
 *    Required for `db.transaction(...)` because the HTTP driver cannot hold a
 *    session open across several round trips. `webSocketConstructor` is required
 *    on Node runtimes because the driver expects a WHATWG `WebSocket`.
 *
 * `DATABASE_URL`      → stateless HTTP endpoint.
 * `DATABASE_POOL_URL` → pooled endpoint used by the transaction-capable pool.
 *                       Falls back to `DATABASE_URL` when unset.
 */

const HTTP_DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const POOLED_DATABASE_URL = process.env.DATABASE_POOL_URL?.trim() || HTTP_DATABASE_URL;

/**
 * Neon pooled endpoints cap concurrent serverless connections per client; a small
 * pool avoids exhausting the instance quota while still allowing parallel
 * interactive transactions.
 */
const POOL_MAX_CONNECTIONS = 10;

/*
 * The Neon serverless driver speaks WHATWG WebSocket, which Node 22+ does not
 * expose as a global. Registering the `ws` implementation on the shared
 * `neonConfig` is what enables the transaction-capable WebSocket driver.
 */
neonConfig.webSocketConstructor = WebSocket;

/** Stateless HTTP client used for short-lived requests and CLI tooling. */
export const httpSql: NeonQueryFunction<false, false> = neon(HTTP_DATABASE_URL);

/**
 * Transaction-capable connection pool. Created eagerly so the first request does
 * not pay for socket warm-up; `Pool` performs no network I/O until a query runs.
 */
export const neonPool = new Pool({
  connectionString: POOLED_DATABASE_URL,
  max: POOL_MAX_CONNECTIONS,
});

/** Default Drizzle handle — use for reads and single-statement writes. */
export const db: NeonHttpDatabase<typeof schema> = drizzle(httpSql, { schema });

/** Transaction-capable Drizzle handle — use for multi-statement units of work. */
export const poolDb: NeonDatabase<typeof schema> = drizzlePooled(neonPool, { schema });

/**
 * Releases pooled connections. Invoked by the NestJS `DatabaseService` on
 * shutdown so redeploys do not leak sockets.
 */
export async function closeDatabase(): Promise<void> {
  await neonPool.end();
}