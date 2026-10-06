import { pgTable, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const systemRoleEnum = pgEnum('system_role', ['OWNER', 'ADMIN', 'AUDITOR', 'MEMBER']);

export const roles = pgTable('roles', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: systemRoleEnum('name').notNull().unique(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
