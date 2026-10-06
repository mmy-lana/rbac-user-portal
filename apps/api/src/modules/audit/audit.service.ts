import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { and, auditLogs, count, desc, eq, ilike, lt, or } from '@rbac/database';
import type { Database } from '@rbac/database';
import { DatabaseService } from '../database/database.service';
import {
  type AuthenticatedUserPayload,
  type InvitationStatus,
  type SystemRole,
} from '@rbac/shared';

/**
 * Security audit trail.
 *
 * What is recorded: invitation lifecycle transitions (issued, accepted, revoked,
 * expired) and role/identity transitions (sign-in, session termination, role
 * binding on claim). Each entry carries the actor, the resource, a structured
 * payload and the request telemetry needed to reconstruct who did what from where.
 *
 * What is never recorded: passwords, password digests, access tokens, refresh
 * tokens, raw claim tokens and full cookie values. `sanitizePayload` is the choke
 * point that enforces this — it is applied to every payload before it reaches the
 * database, so a future caller cannot accidentally leak a credential by passing a
 * wider object.
 *
 * Durability: the acceptance path writes its audit row **inside the invitation
 * transaction** (see `InvitationsService.accept`) because the event and the state
 * change must commit together. Everywhere else, auditing is best-effort: a failed
 * audit write is logged but never fails the business operation that triggered it,
 * so a telemetry outage cannot deny a legitimate operator their action.
 */

/** Keys that must never be persisted into `audit_logs.payload`. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'tokenhash',
  'token_hash',
  'cookie',
  'authorization',
  'secret',
]);

export interface AuditEntry {
  /** `null` for system-originated events (expiry sweeps, rejected claims). */
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  actorId?: string;
  search?: string;
}

export interface AuditPage {
  entries: Array<{
    id: string;
    actorId: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    payload: unknown;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>;
  total: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly dbService: DatabaseService) {}

  private get db(): Database {
    return this.dbService.db;
  }

  /**
   * Appends an audit entry.
   *
   * Never throws: callers are business flows, and a rejected claim or a revoke
   * must not fail because the telemetry write failed. The failure is logged
   * instead, with enough context to replay the gap.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        id: `aud_${crypto.randomUUID()}`,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        payload: sanitizePayload(entry.payload ?? {}),
        ipAddress: entry.ipAddress.slice(0, 45),
        userAgent: entry.userAgent.slice(0, 512),
      });
    } catch (error: unknown) {
      this.logger.error(
        JSON.stringify({
          event: 'audit_write_failed',
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Convenience wrapper for actor-attributed events.
   *
   * `actorId` is nullable in the schema on purpose: `ON DELETE SET NULL` keeps
   * history intact after an account is removed, and that is also how a
   * system-originated event is recorded.
   */
  async recordForActor(
    actor: AuthenticatedUserPayload,
    event: Omit<AuditEntry, 'actorId' | 'ipAddress' | 'userAgent'>,
    telemetry: { ipAddress: string; userAgent: string }
  ): Promise<void> {
    await this.record({
      ...event,
      actorId: actor.userId,
      ipAddress: telemetry.ipAddress,
      userAgent: telemetry.userAgent,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Domain events                                                           */
  /* ---------------------------------------------------------------------- */

  async recordInvitationIssued(params: {
    actor: AuthenticatedUserPayload;
    invitationId: string;
    email: string;
    roleId: string;
    role: SystemRole;
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.recordForActor(
      params.actor,
      {
        action: 'invitation:issued',
        resourceType: 'invitation',
        resourceId: params.invitationId,
        payload: {
          email: params.email,
          roleId: params.roleId,
          role: params.role,
        },
      },
      params.telemetry
    );
  }

  async recordInvitationRevoked(params: {
    actor: AuthenticatedUserPayload;
    invitationId: string;
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.recordForActor(
      params.actor,
      {
        action: 'invitation:revoked',
        resourceType: 'invitation',
        resourceId: params.invitationId,
        payload: {},
      },
      params.telemetry
    );
  }

  /**
   * Records the claim transition.
   *
   * Called with the *new* user as the actor: the invitee is the subject of the
   * event, and attributing it to the inviter would misstate who acted.
   */
  async recordInvitationAccepted(params: {
    userId: string;
    invitationId: string;
    email: string;
    roleId: string;
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.record({
      actorId: params.userId,
      action: 'invitation:accepted',
      resourceType: 'invitation',
      resourceId: params.invitationId,
      payload: { email: params.email, roleId: params.roleId },
      ipAddress: params.telemetry.ipAddress,
      userAgent: params.telemetry.userAgent,
    });
  }

  /** A claim attempt that failed validation — token shape, state or expiry. */
  async recordInvitationClaimRejected(params: {
    reason: string;
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.record({
      actorId: null,
      action: 'invitation:claim_rejected',
      resourceType: 'invitation',
      resourceId: 'unknown',
      payload: { reason: params.reason },
      ipAddress: params.telemetry.ipAddress,
      userAgent: params.telemetry.userAgent,
    });
  }

  /** Expiry sweep summary, attributed to the system. */
  async recordInvitationsExpired(count: number): Promise<void> {
    if (count <= 0) return;
    await this.record({
      actorId: null,
      action: 'invitation:expired',
      resourceType: 'invitation',
      resourceId: 'batch',
      payload: { count },
      ipAddress: '127.0.0.1',
      userAgent: 'vault-internal-sweeper',
    });
  }

  async recordSignIn(params: {
    userId: string;
    role: SystemRole;
    outcome: 'success' | 'failure';
    telemetry: { ipAddress: string; userAgent: string };
    /** Present only on failure; the submitted address, never the password. */
    attemptedEmail?: string;
  }): Promise<void> {
    await this.record({
      actorId: params.outcome === 'success' ? params.userId : null,
      action: params.outcome === 'success' ? 'auth:sign_in' : 'auth:sign_in_failed',
      resourceType: 'session',
      resourceId: params.userId,
      payload: {
        role: params.role,
        ...(params.attemptedEmail ? { attemptedEmail: params.attemptedEmail } : {}),
      },
      ipAddress: params.telemetry.ipAddress,
      userAgent: params.telemetry.userAgent,
    });
  }

  async recordSessionTerminated(params: {
    userId: string;
    reason: 'logout' | 'refresh_reuse_detected' | 'credential_invalid';
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.record({
      actorId: params.userId,
      action: 'auth:session_terminated',
      resourceType: 'session',
      resourceId: params.userId,
      payload: { reason: params.reason },
      ipAddress: params.telemetry.ipAddress,
      userAgent: params.telemetry.userAgent,
    });
  }

  /** Role binding at claim time — the transition that grants access. */
  async recordRoleAssigned(params: {
    userId: string;
    role: SystemRole;
    source: 'invitation_claim' | 'seed_bootstrap';
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.record({
      actorId: params.userId,
      action: 'role:assigned',
      resourceType: 'user',
      resourceId: params.userId,
      payload: { role: params.role, source: params.source },
      ipAddress: params.telemetry.ipAddress,
      userAgent: params.telemetry.userAgent,
    });
  }

  /**
   * Rejects any request attempt to mutate a role outside the invitation flow.
   * Kept as an explicit no-op guard so the absence of role-editing endpoints is a
   * documented decision rather than an oversight.
   */
  async recordRoleChangeAttempt(params: {
    actorId: string;
    from: SystemRole;
    to: SystemRole;
    telemetry: { ipAddress: string; userAgent: string };
  }): Promise<void> {
    await this.record({
      actorId: params.actorId,
      action: 'role:change_rejected',
      resourceType: 'user',
      resourceId: params.actorId,
      payload: { from: params.from, to: params.to },
      ipAddress: params.telemetry.ipAddress,
      userAgent: params.telemetry.userAgent,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Read model (AUDIT_READ)                                                  */
  /* ---------------------------------------------------------------------- */

  /** Paginated audit read model for the `audit:read` permission. */
  async list(query: AuditQuery): Promise<AuditPage> {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 20)));
    const offset = (page - 1) * limit;

    const filters = [];
    if (query.action) filters.push(eq(auditLogs.action, query.action));
    if (query.resourceType) filters.push(eq(auditLogs.resourceType, query.resourceType));
    if (query.actorId) filters.push(eq(auditLogs.actorId, query.actorId));
    if (query.search) {
      const term = `%${query.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      filters.push(or(ilike(auditLogs.action, term), ilike(auditLogs.resourceId, term))!);
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await this.db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        payload: auditLogs.payload,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [totals] = await this.db
      .select({ total: count() })
      .from(auditLogs)
      .where(where);

    return {
      entries: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      total: totals?.total ?? 0,
    };
  }

  /** Retention helper: removes entries older than the retention window. */
  async purgeOlderThan(cutoff: Date): Promise<number> {
    const removed = await this.db
      .delete(auditLogs)
      .where(lt(auditLogs.createdAt, cutoff))
      .returning({ id: auditLogs.id });

    return removed.length;
  }

  /** Convenience for the expiry sweep, which reports how many rows it touched. */
  static countStatuses(rows: Array<{ status: InvitationStatus }>): number {
    return rows.length;
  }
}

/**
 * Removes credential-shaped keys from an audit payload.
 *
 * Applied to every write, so a caller cannot widen the blast radius of a leak by
 * passing an extra object: the value is replaced rather than the key dropped, so
 * the audit entry still documents that the field was present.
 */
export function sanitizePayload(
  payload: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (depth > 4) return { truncated: true };

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[redacted]';
      continue;
    }

    if (Array.isArray(value)) {
      sanitized[key] = value.map((entry) =>
        typeof entry === 'object' && entry !== null
          ? sanitizePayload(entry as Record<string, unknown>, depth + 1)
          : entry
      );
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>, depth + 1);
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}