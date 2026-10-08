import * as path from 'node:path';
import { config as loadEnvFile } from 'dotenv';
import { Pool } from 'pg';
import {
  drizzle,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres';
import * as schema from './schema/index';

/**
 * Environment resolution.
 *
 * This module is evaluated at import time — before any consumer's bootstrap has
 * run `loadAppEnvironment()` or similar. To guarantee the connection string is
 * present when the pool below is constructed, `.env` files are resolved here:
 * package root first, then the repository root. Real environment variables
 * always win (`override: false`), so deployment-injected values are untouched.
 */
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

for (const candidate of [
  path.join(packageRoot, '.env'),
  path.join(repoRoot, '.env'),
]) {
  loadEnvFile({ path: candidate, override: false, quiet: true });
}

/**
 * PostgreSQL connection strategy (node-postgres / `pg`).
 *
 * A single connection pool serves everything: plain queries, pooled reads and
 * session-capable interactive transactions (`db.transaction(...)`). Unlike the
 * previous Neon HTTP/WebSocket split, the standard wire-protocol driver works
 * against any Postgres endpoint — the local Docker container in development
 * (`localhost:5432`) and hosted Postgres in production — with no per-provider
 * driver or WebSocket shimming.
 *
 * `DATABASE_URL`      → primary endpoint.
 * `DATABASE_POOL_URL` → pooled endpoint; falls back to `DATABASE_URL` when unset.
 */
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const POOLED_DATABASE_URL = process.env.DATABASE_POOL_URL?.trim() || DATABASE_URL;

/**
 * Small pool: enough for parallel interactive transactions without exhausting
 * the connection quota on managed/serverless Postgres endpoints.
 */
const POOL_MAX_CONNECTIONS = 10;

/** Shared connection pool behind every Drizzle handle. */
export const pgPool = new Pool({
  connectionString: POOLED_DATABASE_URL,
  max: POOL_MAX_CONNECTIONS,
});

/**
 * Backwards-compatible alias: `DatabaseService` closes the pool on shutdown via
 * this handle.
 */
export const neonPool = pgPool;

/** Default Drizzle handle — use for reads, writes and transactions. */
export const db: NodePgDatabase<typeof schema> = drizzle(pgPool, { schema });

/**
 * Transaction-capable Drizzle handle — same pool as `db`; kept as a separate
 * export so call sites can express intent (`poolDb.transaction`).
 */
export const poolDb: NodePgDatabase<typeof schema> = db;

/**
 * Releases pooled connections. Invoked by the NestJS `DatabaseService` on
 * shutdown so redeploys do not leak sockets.
 */
export async function closeDatabase(): Promise<void> {
  await pgPool.end();
}
