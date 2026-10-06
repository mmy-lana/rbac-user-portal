import path from 'node:path';
import { config as loadEnvFile } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit executes this file from the package root (`packages/database`).
 * Environment files are resolved explicitly so `db:generate` behaves identically
 * whether the process was started by turbo, pnpm, or CI.
 */
const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, '..', '..');

for (const candidate of [
  path.join(packageRoot, '.env'),
  path.join(repoRoot, '.env'),
]) {
  loadEnvFile({ path: candidate, override: false, quiet: true });
}

const databaseUrl = process.env.DATABASE_URL?.trim();

/**
 * `dbCredentials` is attached only when a URL is available: `drizzle-kit generate`
 * is a pure schema-to-SQL transform and must stay runnable on hosts without
 * database access (CI, review environments). `drizzle-kit migrate` is wrapped by
 * `scripts/migrate.mjs`, which skips instead of failing when no URL is present so
 * that `turbo run build` remains hermetic.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});