import { Injectable } from '@nestjs/common';
import { eq, users, roles } from '@rbac/database';
import {
  parseSystemRole,
  parseUserStatus,
  toIsoString,
  toIsoStringOrNull,
  type SystemRole,
  type UserEntity,
  type UserStatus,
} from '@rbac/shared';
import { DatabaseService } from '../database/database.service';

/**
 * Row shape returned by the credential lookup. Includes `passwordHash`, which is
 * why it is deliberately *not* part of the public `UserEntity` contract.
 */
export interface UserWithSecrets {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  roleId: string;
  role: SystemRole | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Row shape returned by non-credential lookups: identical to {@link UserWithSecrets}
 * without the password digest.
 */
export interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  role: SystemRole | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Projects a joined row onto the shared `UserEntity` contract.
 *
 * `UserEntity` is a *composed* projection — `role` comes from the `roles` join,
 * timestamps are serialised to ISO-8601, and a missing role is a hard error
 * rather than a silent `MEMBER` downgrade.
 */
export function toUserEntity(user: UserRecord): UserEntity {
  if (user.role === null) {
    throw new Error(`User ${user.id} references a role that does not resolve to a system role.`);
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    role: user.role,
    status: user.status,
    lastLoginAt: toIsoStringOrNull(user.lastLoginAt),
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Credential lookup for the login flow. Returns `undefined` when no account
   * matches the address.
   *
   * `role: roles.name` is an explicit alias: `UserEntity.role` is typed as the
   * `SystemRole` enum, so the `pgEnum` string union must be narrowed by
   * {@link parseSystemRole} before it crosses the module boundary.
   */
  async findByEmail(email: string): Promise<UserWithSecrets | undefined> {
    const rows = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        firstName: users.firstName,
        lastName: users.lastName,
        roleId: users.roleId,
        role: roles.name,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, email))
      .limit(1);

    const row = rows.at(0);
    if (!row) return undefined;

    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      firstName: row.firstName,
      lastName: row.lastName,
      roleId: row.roleId,
      role: row.role === null ? null : parseSystemRole(row.role),
      status: parseUserStatus(row.status),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<UserEntity | undefined> {
    const rows = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        roleId: users.roleId,
        role: roles.name,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);

    const row = rows.at(0);
    if (!row || row.role === null) return undefined;

    return toUserEntity({
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      roleId: row.roleId,
      role: parseSystemRole(row.role),
      status: parseUserStatus(row.status),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /** Full record (no password digest) keyed by id — used by audit/ownership checks. */
  async findRecordById(id: string): Promise<UserRecord | undefined> {
    const rows = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        roleId: users.roleId,
        role: roles.name,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);

    const row = rows.at(0);
    if (!row) return undefined;

    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      roleId: row.roleId,
      role: row.role === null ? null : parseSystemRole(row.role),
      status: parseUserStatus(row.status),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async existsByEmail(email: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows.length > 0;
  }
}