import { pgTable, varchar, text, unique, primaryKey } from 'drizzle-orm/pg-core';
import { roles } from './roles';

export const permissions = pgTable(
  'permissions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    action: varchar('action', { length: 64 }).notNull(),
    resource: varchar('resource', { length: 64 }).notNull(),
    description: text('description').notNull(),
  },
  (table) => [
    unique('uq_permission_action_resource').on(table.action, table.resource),
  ]
);

/**
 * Join table resolving the role → permission grants. Declared as a composite
 * primary key (not a bare unique constraint) so that referential targets and
 * `ON CONFLICT` upserts use `PRIMARY KEY` semantics.
 */
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
  (table) => [
    primaryKey({
      name: 'role_permissions_role_id_permission_id_pk',
      columns: [table.roleId, table.permissionId],
    }),
  ]
);