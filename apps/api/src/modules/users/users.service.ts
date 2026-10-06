import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users, roles } from '@rbac/database';
import { DatabaseService } from '../database/database.service';
import { UserEntity } from '@rbac/shared';

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DatabaseService) {}

  async findByEmail(email: string) {
    const result = await this.dbService.db
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
      .where(eq(users.email, email));

    return result.at(0);
  }

  async findById(id: string): Promise<UserEntity | undefined> {
    const result = await this.dbService.db
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
      .where(eq(users.id, id));

    const item = result.at(0);
    if (!item || !item.role) return undefined;

    return {
      id: item.id,
      email: item.email,
      firstName: item.firstName,
      lastName: item.lastName,
      roleId: item.roleId,
      role: item.role,
      status: item.status,
      lastLoginAt: item.lastLoginAt ? item.lastLoginAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
