/**
 * Invitation lifecycle constants.
 *
 * These live in `@rbac/shared` so the API, the seed tooling and the claim screen
 * cannot disagree about token strength or the expiry window.
 */

/** Claim tokens are `crypto.randomBytes(32)` rendered as hex (256 bits). */
export const INVITATION_TOKEN_BYTES = 32;

/** Fixed validity window for a dispatched invitation. */
export const INVITATION_TTL_HOURS = 72;

/**
 * Single path segment handed to the invitee.
 *
 * The token travels as a path parameter and never as a query string: query
 * strings are captured verbatim by access logs, analytics and `Referer` headers,
 * all of which would then hold a live claim credential.
 */
export const INVITATION_CLAIM_PATH = '/invitations/accept';

/** Deterministic role ids provisioned by the seed script. */
export const SYSTEM_ROLE_IDS = {
  OWNER: 'rol_00000000-0000-0000-0000-000000000001',
  ADMIN: 'rol_00000000-0000-0000-0000-000000000002',
  AUDITOR: 'rol_00000000-0000-0000-0000-000000000003',
  MEMBER: 'rol_00000000-0000-0000-0000-000000000004',
} as const;

/** Minimum entropy required of an invited account's passphrase. */
export const MIN_PASSWORD_LENGTH = 12;

/** Upper bound enforced on the accept payload to bound bcrypt work. */
export const MAX_PASSWORD_LENGTH = 128;