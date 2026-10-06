import { pgTable, varchar, text, unique } from 'drizzle-orm/pg-core';
import { roles } from './roles';

export const permissions = pgTable(
  'permissions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    action: varchar('action', { length: 64 }).notNull(),
    resource: varchar('resource', { length: 64 }).notNull(),
    description: text('description').notNull(),
  },
  (t) => ({
    unq: unique('uq_permission_action_resource').on(t.action, t.resource),
  })
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: varchar('permission_id', { length: 64 })
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: unique().on(t.roleId, t.permissionId),
  })
);
