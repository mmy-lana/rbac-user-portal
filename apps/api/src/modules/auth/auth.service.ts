import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users, rolePermissions, permissions } from '@rbac/database';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import {
  AuthenticatedUserPayload,
  Permission,
  ALL_PERMISSIONS,
  SystemRole,
  UserStatus,
  MeResponseDto,
} from '@rbac/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly dbService: DatabaseService
  ) {}

  async validateUserCredentials(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Authentication credentials invalid');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User identity suspended or pending');
    }

    const matches = await bcrypt.compare(pass, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Authentication credentials invalid');
    }

    return user;
  }

  async getPermissionsForRole(roleId: string, roleName: SystemRole): Promise<Permission[]> {
    if (roleName === SystemRole.OWNER) {
      return ALL_PERMISSIONS;
    }

    const perms = await this.dbService.db
      .select({ action: permissions.action })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return perms.map((p) => p.action as Permission);
  }

  async createSession(user: { id: string; email: string; roleId: string; role: SystemRole | null }) {
    if (!user.role) {
      throw new UnauthorizedException('Invalid role mapping');
    }

    const userPermissions = await this.getPermissionsForRole(user.roleId, user.role);

    const payload: AuthenticatedUserPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: userPermissions,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'vault_insecure_access_secret_development_minimum_32_bytes_entropy',
      expiresIn: '15m',
    });

    const refreshTokenRaw = `${user.id}.${Date.now()}.${Math.random().toString(36).substring(2)}`;
    const refreshHash = await bcrypt.hash(refreshTokenRaw, 12);

    await this.dbService.db
      .update(users)
      .set({
        refreshTokenHash: refreshHash,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      accessToken,
      refreshTokenRaw,
      expiresIn: 900,
      user: payload,
    };
  }

  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User does not exist');
    }

    const userPermissions = await this.getPermissionsForRole(user.roleId, user.role);

    return {
      ...user,
      permissions: userPermissions,
    };
  }

  async rotateSession(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const parts = refreshToken.split('.');
    const userId = parts[0];
    if (!userId) {
      throw new UnauthorizedException('Invalid refresh credential');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Identity invalid');
    }

    const dbUserRow = await this.dbService.db
      .select({ refreshTokenHash: users.refreshTokenHash })
      .from(users)
      .where(eq(users.id, userId));

    const currentHash = dbUserRow.at(0)?.refreshTokenHash;
    if (!currentHash) {
      throw new UnauthorizedException('Session terminated');
    }

    const valid = await bcrypt.compare(refreshToken, currentHash);
    if (!valid) {
      await this.dbService.db
        .update(users)
        .set({ refreshTokenHash: null })
        .where(eq(users.id, userId));
      throw new UnauthorizedException('Session token reuse detected');
    }

    return this.createSession({
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      role: user.role,
    });
  }

  async terminateSession(userId: string) {
    await this.dbService.db
      .update(users)
      .set({ refreshTokenHash: null })
      .where(eq(users.id, userId));
    return { revoked: true };
  }
}
