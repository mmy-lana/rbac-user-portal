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