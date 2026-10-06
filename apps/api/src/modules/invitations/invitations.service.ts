import {
  Injectable,
  ConflictException,
  NotFoundException,
  GoneException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { eq, and, sql, invitations, users, roles, auditLogs } from '@rbac/database';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import {
  parseInvitationStatus,
  parseSystemRole,
  InvitationEntity,
  SystemRole,
} from '@rbac/shared';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly authService: AuthService
  ) {}

  async createInvitation(dto: { email: string; roleId: string }, invitedByUserId: string) {
    const existingActive = await this.dbService.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(eq(invitations.email, dto.email), eq(invitations.status, 'PENDING')));

    if (existingActive.length > 0) {
      throw new ConflictException('Active pending invitation already exists for this email identity');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invitationId = `inv_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await this.dbService.db.insert(invitations).values({
      id: invitationId,
      email: dto.email,
      roleId: dto.roleId,
      tokenHash: tokenHash,
      status: 'PENDING',
      invitedByUserId: invitedByUserId,
      expiresAt: expiresAt,
    });

    const roleResult = await this.dbService.db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, dto.roleId));

    const roleName = roleResult.at(0)?.name || 'MEMBER';

    return {
      id: invitationId,
      email: dto.email,
      role: roleName,
      status: 'PENDING',
      expiresAt: expiresAt.toISOString(),
      invitationUrl: `${process.env.WEB_APP_ORIGIN || 'http://localhost:5173'}/invitations/accept/${rawToken}`,
    };
  }

  async listInvitations(page = 1, limit = 20): Promise<{ items: InvitationEntity[]; total: number }> {
    const offset = (page - 1) * limit;

    const rows = await this.dbService.db
      .select({
        id: invitations.id,
        email: invitations.email,
        roleId: invitations.roleId,
        role: roles.name,
        status: invitations.status,
        invitedByUserId: invitations.invitedByUserId,
        invitedByEmail: users.email,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        createdAt: invitations.createdAt,
        updatedAt: invitations.updatedAt,
      })
      .from(invitations)
      .leftJoin(roles, eq(invitations.roleId, roles.id))
      .leftJoin(users, eq(invitations.invitedByUserId, users.id))
      .limit(limit)
      .offset(offset);

    const countResult = await this.dbService.db
      .select({ count: sql<number>`count(*)::int` })
      .from(invitations);

    const total = countResult.at(0)?.count ?? 0;

    const items: InvitationEntity[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      roleId: r.roleId,
      role: parseSystemRole(r.role),
      status: parseInvitationStatus(r.status),
      invitedByUserId: r.invitedByUserId,
      invitedByEmail: r.invitedByEmail || 'system@vault.internal',
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { items, total };
  }

  async validateToken(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const result = await this.dbService.db
      .select({
        id: invitations.id,
        role: roles.name,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .leftJoin(roles, eq(invitations.roleId, roles.id))
      .where(eq(invitations.tokenHash, tokenHash));

    const inv = result.at(0);
    if (!inv) {
      throw new NotFoundException('Invitation token is invalid or does not exist');
    }

    if (inv.status === 'EXPIRED' || inv.expiresAt < new Date()) {
      throw new GoneException('Invitation authorization threshold expired');
    }

    if (inv.status === 'REVOKED') {
      throw new ForbiddenException('Invitation authorization revoked by administrator');
    }

    if (inv.status === 'ACCEPTED') {
      throw new ConflictException('Invitation credentials already consumed');
    }

    return {
      role: parseSystemRole(inv.role),
      isValid: true,
    };
  }

  async acceptInvitation(rawToken: string, dto: { firstName: string; lastName: string; password: string }, clientIp: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const client = await this.dbService.neonPool.connect();

    try {
      await client.query('BEGIN');

      const invRes = await client.query(
        `SELECT id, email, role_id, status, expires_at FROM invitations WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash]
      );

      const inv = invRes.rows[0];
      if (!inv) {
        throw new NotFoundException('Invitation authorization token not found');
      }

      if (inv.status === 'EXPIRED' || new Date(inv.expires_at) < new Date()) {
        throw new GoneException('Invitation threshold expired');
      }

      if (inv.status === 'REVOKED') {
        throw new ForbiddenException('Invitation access revoked');
      }

      if (inv.status === 'ACCEPTED') {
        throw new ConflictException('Invitation credential already claimed');
      }

      const existingUser = await client.query(`SELECT id FROM users WHERE email = $1`, [inv.email]);
      if (existingUser.rows.length > 0) {
        throw new ConflictException('Identity email already registered in system');
      }

      const userId = `usr_${crypto.randomUUID()}`;
      const passwordHash = await bcrypt.hash(dto.password, 12);

      await client.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
        [userId, inv.email, passwordHash, dto.firstName, dto.lastName, inv.role_id]
      );

      await client.query(
        `UPDATE invitations SET status = 'ACCEPTED', accepted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inv.id]
      );

      await client.query(
        `INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, payload, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `aud_${crypto.randomUUID()}`,
          userId,
          'invitations:accepted',
          'invitations',
          inv.id,
          JSON.stringify({ email: inv.email, roleId: inv.role_id }),
          clientIp,
          'Vault Secure Gateway',
        ]
      );

      const roleRes = await client.query(`SELECT name FROM roles WHERE id = $1`, [inv.role_id]);
      const roleName = (roleRes.rows[0]?.name as SystemRole) || SystemRole.MEMBER;

      await client.query('COMMIT');

      return this.authService.createSession({
        id: userId,
        email: inv.email,
        roleId: inv.role_id,
        role: roleName,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async revokeInvitation(invitationId: string) {
    const result = await this.dbService.db
      .update(invitations)
      .set({ status: 'REVOKED', updatedAt: new Date() })
      .where(eq(invitations.id, invitationId));

    return { revoked: true };
  }
}
