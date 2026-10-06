import { pgTable, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { roles } from './roles';

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION']);

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    status: userStatusEnum('status').default('PENDING_ACTIVATION').notNull(),
    // bcrypt digest (12 rounds) of the rotating refresh token. Never the token itself.
    refreshTokenHash: varchar('refresh_token_hash', { length: 255 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_users_email').on(table.email)]
);