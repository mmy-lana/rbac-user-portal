import type { Request } from 'express';

/**
 * Client IP extraction.
 *
 * Behind a trusted proxy (Render, or a CDN in front of it) the socket address is
 * the proxy's, so the real client has to be read from `x-forwarded-for`, which
 * carries a comma-separated chain ordered `[client, proxy1, proxy2, …]`. The first
 * entry is the originating client.
 *
 * `trust proxy` is enabled in `main.ts`, which is what makes Express willing to
 * believe this header; without it the header would be client-controlled and
 * spoofable, defeating both rate limiting and audit attribution.
 *
 * Note the `?.trim()`: under `noUncheckedIndexedAccess`, `split(',')[0]` is
 * `string | undefined`, and the optional chain is required to narrow it.
 */
export function extractClientIp(request: Request): string {
  const rawForwarded = request.headers['x-forwarded-for'];
  const clientIp =
    typeof rawForwarded === 'string'
      ? rawForwarded.split(',')[0]?.trim() || request.socket.remoteAddress || '127.0.0.1'
      : request.socket.remoteAddress || '127.0.0.1';

  return clientIp;
}

/** `user-agent`, normalised for the `audit_logs.user_agent` column. */
export function extractUserAgent(request: Request): string {
  const raw = request.headers['user-agent'];
  return typeof raw === 'string' && raw.length > 0 ? raw.slice(0, 512) : 'unknown';
}

/** `ip_address` is `VARCHAR(45)` — long enough for a full IPv6 address. */
export function toStoredIp(request: Request): string {
  return extractClientIp(request).slice(0, 45);
}