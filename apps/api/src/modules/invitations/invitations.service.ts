import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  roles as rolesTable,
  users as usersTable,
  invitations as invitationsTable,
  auditLogs as auditLogsTable,
} from '@rbac/database';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { APP_ENV, type AppEnvironment } from '../../config/env';
import {
  INVITATION_CLAIM_PATH,
  INVITATION_TOKEN_BYTES,
  INVITATION_TTL_HOURS,
  buildPaginationMeta,
  isExpired,
  parseInvitationStatus,
  parseSystemRole,
  toIsoString,
  toIsoStringOrNull,
  InvitationStatus,
  type AuthenticatedUserPayload,
  type InvitationEntity,
  type MeResponseDto,
  type PaginationMeta,
  type SystemRole,
} from '@rbac/shared';

/** bcrypt work factor for the password created during acceptance. */
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Minimum time spent handling a token validation request.
 *
 * Without a floor, a lookup miss returns measurably faster than a lookup hit,
 * which turns the endpoint into a token oracle. Both branches pad to the same
 * floor so the response time carries no information about the token space.
 */
const VALIDATION_MINIMUM_LATENCY_MS = 100;

/** Ids are generated as `<prefix>_<uuid>`. */
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** SHA-256 hex digest — the only form of a claim token that is ever stored. */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export interface CreateInvitationInput {
  email: string;
  roleId: string;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: SystemRole;
  status: InvitationStatus;
  expiresAt: string;
  /** Full claim link. Returned once and never retrievable again. */
  invitationUrl: string;
}

export interface InvitationListQuery {
  page?: number | string;
  limit?: number | string;
  status?: InvitationStatus;
  search?: string;
}

export interface InvitationListResult {
  items: InvitationEntity[];
  meta: PaginationMeta;
}

export interface AcceptInvitationInput {
  firstName: string;
  lastName: string;
  password: string;
}

/**
 * Outcome of a successful claim.
 *
 * `refreshToken` is separated from `tokens` so the controller can place it in
 * the HttpOnly cookie while the response body exposes only the access token.
 */
export interface AcceptedInvitation {
  user: MeResponseDto;
  tokens: { accessToken: string; expiresIn: number };
  refreshToken: string;
}

export interface RequestTelemetry {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnvironment
  ) {}

  /**
   * Dispatches a new invitation.
   *
   * The raw token is generated here, returned to the caller in the claim URL and
   * then discarded: only its SHA-256 digest is persisted, so neither a database
   * disclosure nor an audit-log reader can reconstruct a working claim link.
   */
  async create(
    input: CreateInvitationInput,
    actor: AuthenticatedUserPayload,
    telemetry: RequestTelemetry
  ): Promise<CreatedInvitation> {
    const email = input.email.trim().toLowerCase();

    const role = await this.resolveRole(input.roleId);

    if (await this.usersService.existsByEmail(email)) {
      throw new ConflictException('That identity already exists in the vault.');
    }

    const existingPending = await this.dbService.db
      .select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(and(eq(invitationsTable.email, email), eq(invitationsTable.status, 'PENDING')))
      .limit(1);

    if (existingPending.length > 0) {
      throw new ConflictException(
        'A pending invitation already exists for this address. Revoke it before issuing a new one.'
      );
    }

    const rawToken = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
    const id = generateId('inv');

    const inserted = await this.dbService.db
      .insert(invitationsTable)
      .values({
        id,
        email,
        roleId: input.roleId,
        tokenHash: hashToken(rawToken),
        status: InvitationStatus.PENDING,
        invitedByUserId: actor.userId,
        expiresAt,
      })
      .returning({ id: invitationsTable.id });

    if (inserted.length === 0) {
      throw new BadRequestException('The invitation could not be issued.');
    }

    await this.recordAudit({
      actorId: actor.userId,
      action: 'invitation:created',
      resourceType: 'invitation',
      resourceId: id,
      payload: { email, roleId: input.roleId, role: role.name },
      telemetry,
    });

    return {
      id,
      email,
      role: role.name,
      status: InvitationStatus.PENDING,
      expiresAt: toIsoString(expiresAt),
      invitationUrl: `${this.env.webAppOrigin}${INVITATION_CLAIM_PATH}/${rawToken}`,
    };
  }

  /** Paginated invitation directory with optional status and text filters. */
  async list(query: InvitationListQuery): Promise<InvitationListResult> {
    const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(query.limit ?? '20'), 10) || 20)
    );
    const offset = (page - 1) * limit;

    const filters = [];
    if (query.status) {
      filters.push(eq(invitationsTable.status, query.status));
    }
    const search = query.search?.trim();
    if (search) {
      // `pgEnum` comparison is exact; the free-text filter targets the
      // inviter's address, which is the field operators actually scan for.
      filters.push(ilike(usersTable.email, `%${escapeLike(search)}%`));
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await this.dbService.db
      .select({
        id: invitationsTable.id,
        email: invitationsTable.email,
        roleId: invitationsTable.roleId,
        role: rolesTable.name,
        status: invitationsTable.status,
        invitedByUserId: invitationsTable.invitedByUserId,
        invitedByEmail: usersTable.email,
        expiresAt: invitationsTable.expiresAt,
        acceptedAt: invitationsTable.acceptedAt,
        createdAt: invitationsTable.createdAt,
        updatedAt: invitationsTable.updatedAt,
      })
      .from(invitationsTable)
      .leftJoin(rolesTable, eq(invitationsTable.roleId, rolesTable.id))
      .leftJoin(usersTable, eq(invitationsTable.invitedByUserId, usersTable.id))
      .where(where)
      .orderBy(desc(invitationsTable.createdAt), asc(invitationsTable.email))
      .limit(limit)
      .offset(offset);

    const [{ total } = { total: 0 }] = await this.dbService.db
      .select({ total: count() })
      .from(invitationsTable)
      .leftJoin(usersTable, eq(invitationsTable.invitedByUserId, usersTable.id))
      .where(where);

    const items = rows.map((row) => this.toEntity(row));

    // Persist the derived EXPIRED state so the directory cannot keep showing a
    // stale "pending" invitation once its window has closed.
    await this.sweepExpiredInvitations();

    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * Public token probe used by the claim screen.
   *
   * Two properties are deliberate:
   *  - the response omits the target email, so an unauthenticated visitor cannot
   *    use the endpoint to test whether an address is registered;
   *  - every branch (hit, miss, expired, revoked, consumed) pays the same
   *    latency floor, so timing cannot be used to enumerate the token space.
   */
  async validateToken(rawToken: string): Promise<{ role: SystemRole; isValid: true }> {
    const startedAt = Date.now();

    try {
      const invitation = await this.findByToken(rawToken);

      if (!invitation) {
        throw new NotFoundException('This invitation link is not valid.');
      }

      const status = parseInvitationStatus(invitation.status);

      if (status === 'REVOKED') {
        throw new ForbiddenException('This invitation was revoked by an administrator.');
      }
      if (status === 'ACCEPTED') {
        throw new ConflictException('This invitation has already been claimed.');
      }
      if (status === 'EXPIRED' || isExpired(invitation.expiresAt)) {
        throw new GoneException('This invitation link has expired.');
      }

      return { role: parseSystemRole(invitation.role), isValid: true };
    } finally {
      await padToMinimumLatency(startedAt, VALIDATION_MINIMUM_LATENCY_MS);
    }
  }

  /**
   * Acceptance pipeline.
   *
   * Runs as one interactive transaction on the WebSocket pool (`poolDb`): the
   * HTTP driver cannot hold a session open across several statements, so using
   * it here would let two simultaneous submissions both observe a `PENDING`
   * invitation and each create a user for the same claim.
   *
   * Order of operations inside the transaction:
   *   1. lock the invitation row (`FOR UPDATE`) and re-check its state;
   *   2. refuse if the address is already registered;
   *   3. insert the user with a bcrypt (12 rounds) digest;
   *   4. flip the invitation to `ACCEPTED` and stamp `accepted_at`;
   *   5. append the audit entry.
   *
   * Session tokens are issued only after the commit succeeds.
   */
  async accept(
    rawToken: string,
    input: AcceptInvitationInput,
    telemetry: RequestTelemetry
  ): Promise<AcceptedInvitation> {
    const tokenHash = hashToken(rawToken);

    const userId = await this.dbService.poolDb.transaction(async (tx) => {
      const locked = await tx
        .select({
          id: invitationsTable.id,
          email: invitationsTable.email,
          roleId: invitationsTable.roleId,
          status: invitationsTable.status,
          expiresAt: invitationsTable.expiresAt,
        })
        .from(invitationsTable)
        .where(eq(invitationsTable.tokenHash, tokenHash))
        .for('update')
        .limit(1);

      const invitation = locked.at(0);
      if (!invitation) {
        throw new NotFoundException('This invitation link is not valid.');
      }

      const status = parseInvitationStatus(invitation.status);
      if (status === 'REVOKED') {
        throw new ForbiddenException('This invitation was revoked by an administrator.');
      }
      if (status === 'ACCEPTED') {
        throw new ConflictException('This invitation has already been claimed.');
      }
      if (status === 'EXPIRED' || isExpired(invitation.expiresAt)) {
        throw new GoneException('This invitation link has expired.');
      }

      const existing = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, invitation.email))
        .limit(1);
      if (existing.length > 0) {
        throw new ConflictException('This identity is already registered in the vault.');
      }

      const newUserId = generateId('usr');
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

      await tx.insert(usersTable).values({
        id: newUserId,
        email: invitation.email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        roleId: invitation.roleId,
        // Acceptance *is* the activation: the identity is fully proven by
        // possession of the claim link.
        status: 'ACTIVE',
      });

      await tx
        .update(invitationsTable)
        .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(invitationsTable.id, invitation.id));

      await tx.insert(auditLogsTable).values({
        id: generateId('aud'),
        actorId: newUserId,
        action: 'invitation:accepted',
        resourceType: 'invitation',
        resourceId: invitation.id,
        payload: { email: invitation.email, roleId: invitation.roleId },
        ipAddress: telemetry.ipAddress,
        userAgent: telemetry.userAgent,
      });

      return newUserId;
    });

    // Tokens are minted only once the row state is durably committed.
    const session = await this.authService.createSessionById(userId);
    return {
      user: session.user,
      tokens: { accessToken: session.accessToken, expiresIn: session.expiresIn },
      refreshToken: session.refreshToken,
    };
  }

  /**
   * Revokes a pending invitation.
   *
   * Only `PENDING` rows are affected: revoking an already accepted or expired
   * invitation is a no-op that reports failure rather than rewriting history.
   */
  async revoke(
    invitationId: string,
    actor: AuthenticatedUserPayload,
    telemetry: RequestTelemetry
  ): Promise<{ revoked: boolean }> {
    const updated = await this.dbService.db
      .update(invitationsTable)
      .set({ status: 'REVOKED', updatedAt: new Date() })
      .where(and(eq(invitationsTable.id, invitationId), eq(invitationsTable.status, 'PENDING')))
      .returning({ id: invitationsTable.id });

    if (updated.length === 0) {
      const existing = await this.dbService.db
        .select({ id: invitationsTable.id, status: invitationsTable.status })
        .from(invitationsTable)
        .where(eq(invitationsTable.id, invitationId))
        .limit(1);

      const row = existing.at(0);
      if (!row) {
        throw new NotFoundException('That invitation does not exist.');
      }
      throw new ConflictException(
        `This invitation is already ${parseInvitationStatus(row.status).toLowerCase()} and cannot be revoked.`
      );
    }

    await this.recordAudit({
      actorId: actor.userId,
      action: 'invitation:revoked',
      resourceType: 'invitation',
      resourceId: invitationId,
      payload: {},
      telemetry,
    });

    return { revoked: true };
  }

  /** Permission labels for the invitee picker in the admin UI. */
  async listAssignableRoles(): Promise<Array<{ id: string; name: SystemRole; description: string }>> {
    const rows = await this.dbService.db
      .select({
        id: rolesTable.id,
        name: rolesTable.name,
        description: rolesTable.description,
      })
      .from(rolesTable)
      .where(
        inArray(rolesTable.name, ['ADMIN', 'AUDITOR', 'MEMBER'] as const)
      )
      .orderBy(asc(rolesTable.id));

    return rows.map((row) => ({
      id: row.id,
      name: parseSystemRole(row.name),
      description: row.description,
    }));
  }

  private async resolveRole(roleId: string): Promise<{ id: string; name: SystemRole }> {
    const rows = await this.dbService.db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(eq(rolesTable.id, roleId))
      .limit(1);

    const role = rows.at(0);
    if (!role) {
      throw new BadRequestException('The requested role does not exist.');
    }

    return { id: role.id, name: parseSystemRole(role.name) };
  }

  private async findByToken(rawToken: string) {
    const rows = await this.dbService.db
      .select({
        id: invitationsTable.id,
        email: invitationsTable.email,
        role: rolesTable.name,
        status: invitationsTable.status,
        expiresAt: invitationsTable.expiresAt,
      })
      .from(invitationsTable)
      .leftJoin(rolesTable, eq(invitationsTable.roleId, rolesTable.id))
      .where(eq(invitationsTable.tokenHash, hashToken(rawToken)))
      .limit(1);

    return rows.at(0);
  }

  /**
   * Transitions overdue `PENDING` invitations to `EXPIRED`.
   *
   * The status is *computed* on read as well as persisted lazily here, so the
   * directory is correct even before the sweep runs.
   */
  private async sweepExpiredInvitations(): Promise<void> {
    await this.dbService.db
      .update(invitationsTable)
      .set({ status: 'EXPIRED', updatedAt: new Date() })
      .where(and(eq(invitationsTable.status, 'PENDING'), lt(invitationsTable.expiresAt, new Date())));
  }

  private toEntity(row: {
    id: string;
    email: string;
    roleId: string;
    role: string | null;
    status: string;
    invitedByUserId: string;
    invitedByEmail: string | null;
    expiresAt: Date;
    acceptedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): InvitationEntity {
    const status = parseInvitationStatus(row.status);
    const expired =
      status === 'PENDING' &&
      isExpired(row.expiresAt);

    return {
      id: row.id,
      email: row.email,
      roleId: row.roleId,
      role: parseSystemRole(row.role),
      // Derived state is reported even before the lazy sweep persists it.
      status: expired ? InvitationStatus.EXPIRED : status,
      invitedByUserId: row.invitedByUserId,
      invitedByEmail: row.invitedByEmail ?? 'unknown@vault.internal',
      expiresAt: toIsoString(row.expiresAt),
      acceptedAt: toIsoStringOrNull(row.acceptedAt),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  private async recordAudit(entry: {
    actorId: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    payload: Record<string, unknown>;
    telemetry: RequestTelemetry;
  }): Promise<void> {
    await this.dbService.db.insert(auditLogsTable).values({
      id: generateId('aud'),
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      payload: entry.payload,
      ipAddress: entry.telemetry.ipAddress,
      userAgent: entry.telemetry.userAgent,
    });
  }
}

/** Sleeps only for the remaining time needed to reach the latency floor. */
async function padToMinimumLatency(startedAt: number, floorMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  const remaining = floorMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * Escapes the LIKE metacharacters so a search term containing `%` or `_` matches
 * literally instead of turning into a wildcard scan over the table.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}