import type { Request } from 'express';
import type { AuthenticatedUserPayload } from '@rbac/shared';

/**
 * Result of a completed refresh rotation.
 *
 * `refreshToken` is the freshly minted opaque token. It must only ever travel to
 * the client inside the HttpOnly cookie — never in a response body, never in a
 * log line, never in an audit payload.
 */
export interface RefreshSession {
  principal: AuthenticatedUserPayload;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
}

/** Express request enriched by `JwtRefreshGuard`. */
export interface RequestWithRefreshSession extends Request {
  refreshSession?: RefreshSession;
}

/** Express request enriched by `JwtAuthGuard`. */
export interface RequestWithUser extends Request {
  user?: AuthenticatedUserPayload;
}

/**
 * Per-request telemetry attached by `RequestContextInterceptor`.
 *
 * Controllers read `requestId` instead of minting one themselves, which is what
 * lets a client-supplied `x-request-id` be echoed consistently into the response
 * envelope, the audit trail and the server log — one correlation id per request.
 */
export interface RequestContext {
  requestId: string;
  /** `performance.now()` at entry, used for the duration log line. */
  startedAt: number;
  request: RequestWithUser;
}

/** Express request carrying the interceptor-assigned context. */
export interface RequestWithContext extends RequestWithUser {
  requestId: string;
  startedAt: number;
}

/** Resolves the correlation id for a request, falling back to a fresh one. */
export function resolveRequestId(request: RequestWithContext | Request): string {
  const assigned = (request as RequestWithContext).requestId;
  if (typeof assigned === 'string' && assigned.length > 0) return assigned;

  const header = request.headers['x-request-id'];
  if (typeof header === 'string' && header.length > 0 && header.length <= 128) return header;

  return `req_${crypto.randomUUID()}`;
}