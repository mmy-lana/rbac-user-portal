import * as path from 'node:path';
import * as dotenv from 'dotenv';

/**
 * Typed runtime configuration.
 *
 * Everything the API reads from `process.env` is funnelled through this module
 * so that:
 *  - missing or malformed values fail at boot with an actionable message,
 *    instead of surfacing as a confusing runtime failure on the first request;
 *  - production deployments cannot silently boot with the documented insecure
 *    development secrets;
 *  - tests can inject a complete environment without touching `process.env`
 *    one key at a time.
 */

export type NodeEnvironment = 'development' | 'production' | 'test';

/** Access token lifetime: 15 minutes, per the dual-token standard. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token lifetime: 7 days, per the dual-token standard. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum entropy floor enforced on JWT secrets outside development. */
const MIN_SECRET_LENGTH = 32;

/** Name of the refresh cookie. `__Host-` forces Secure + Path=/ + no Domain. */
export const REFRESH_COOKIE_NAME = '__Host-vault_refresh_token';

export const DEVELOPMENT_ACCESS_SECRET =
  'vault_insecure_access_secret_development_minimum_32_bytes_entropy';
export const DEVELOPMENT_REFRESH_SECRET =
  'vault_insecure_refresh_secret_development_minimum_32_bytes_entropy';

export interface RateLimitProfile {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  ttl: number;
}

export interface AppEnvironment {
  nodeEnv: NodeEnvironment;
  isProduction: boolean;
  port: number;
  webAppOrigin: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlMs: number;
  refreshCookieName: string;
  rateLimits: {
    /** Authentication endpoints — credential-stuffing surface. */
    auth: RateLimitProfile;
    /** Public invitation claim endpoints — token-guessing surface. */
    invitationClaim: RateLimitProfile;
    /** Everything else behind the gateway. */
    general: RateLimitProfile;
  };
}

/** Injection token for {@link AppEnvironment}. */
export const APP_ENV = 'APP_ENV';

function readNodeEnv(): NodeEnvironment {
  const raw = process.env.NODE_ENV?.trim().toLowerCase();
  if (raw === 'production' || raw === 'test') return raw;
  return 'development';
}

function readPort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) return 3000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid PORT value "${raw}". Expected an integer between 1 and 65535.`);
  }
  return parsed;
}

function readOrigin(isProduction: boolean): string {
  const raw = process.env.WEB_APP_ORIGIN?.trim();
  if (!raw) {
    if (!isProduction) {
      return 'http://localhost:5173';
    }
    throw new Error(
      'WEB_APP_ORIGIN is required in production. Set it to the exact browser origin of the web app, e.g. https://portal.example.com.'
    );
  }
  // CORS with credentials must never be configured from a wildcard.
  if (raw === '*') {
    throw new Error('WEB_APP_ORIGIN must be a concrete origin; wildcard origins are rejected.');
  }
  return raw.replace(/\/$/, '');
}

function readSecret(name: string, isProduction: boolean, fallback: string): string {
  const raw = process.env[name]?.trim();
  if (raw && raw.length >= MIN_SECRET_LENGTH) return raw;

  if (isProduction) {
    throw new Error(
      `${name} must be set to at least ${MIN_SECRET_LENGTH} characters in production.`
    );
  }

  if (raw && raw.length > 0) {
    process.emitWarning(
      `${name} is shorter than ${MIN_SECRET_LENGTH} characters; falling back to the development secret.`,
      'SecurityWarning'
    );
  }
  return fallback;
}

/**
 * Loads `.env` files from the package directory and the repository root.
 *
 * Values already present in `process.env` always win: real deployments inject
 * environment variables directly and must never be overridden by a file.
 */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  const candidates = [
    path.join(cwd, '.env'),
    path.resolve(cwd, '..', '.env'),
    path.resolve(cwd, '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    dotenv.config({ path: candidate, override: false, quiet: true });
  }
}

export function loadAppEnvironment(): AppEnvironment {
  loadEnvFiles();

  const nodeEnv = readNodeEnv();
  const isProduction = nodeEnv === 'production';

  const accessSecret = readSecret('JWT_ACCESS_SECRET', isProduction, DEVELOPMENT_ACCESS_SECRET);
  const refreshSecret = readSecret('JWT_REFRESH_SECRET', isProduction, DEVELOPMENT_REFRESH_SECRET);

  if (accessSecret === refreshSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ. Reusing one secret for both token classes collapses the dual-token boundary.'
    );
  }

  return {
    nodeEnv,
    isProduction,
    port: readPort(),
    webAppOrigin: readOrigin(isProduction),
    jwtAccessSecret: accessSecret,
    jwtRefreshSecret: refreshSecret,
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlMs: REFRESH_TOKEN_TTL_MS,
    refreshCookieName: REFRESH_COOKIE_NAME,
    rateLimits: {
      auth: { limit: 5, ttl: 60_000 },
      invitationClaim: { limit: 5, ttl: 60_000 },
      general: { limit: 100, ttl: 60_000 },
    },
  };
}