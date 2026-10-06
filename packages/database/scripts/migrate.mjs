#!/usr/bin/env node
/**
 * Migration runner for the Neon PostgreSQL database.
 *
 * `drizzle-kit migrate` requires live credentials. The Turborepo pipeline makes
 * `api#build` depend on `@rbac/database#db:migrate`, which means the migration
 * task also runs on hosts that intentionally have no database access (CI image
 * builds, local `turbo run build` before provisioning Neon). Hard-failing there
 * would make the build non-hermetic, so an absent `DATABASE_URL` degrades to an
 * explicit no-op instead of an error.
 *
 * Deployment environments (Render) always provide `DATABASE_URL`, so the
 * documented bootstrap sequence still migrates for real.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnvFile } from 'dotenv';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

for (const candidate of [
  path.join(packageRoot, '.env'),
  path.join(repoRoot, '.env'),
]) {
  loadEnvFile({ path: candidate, override: false, quiet: true });
}

if (!process.env.DATABASE_URL?.trim()) {
  console.warn('[db:migrate] DATABASE_URL is not set — migration skipped (no-op).');
  process.exit(0);
}

const cli = process.platform === 'win32' ? 'drizzle-kit.cmd' : 'drizzle-kit';
const result = spawnSync(cli, ['migrate'], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`[db:migrate] failed to launch drizzle-kit: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);