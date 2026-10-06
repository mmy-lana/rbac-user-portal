import { pgTable, varchar, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { roles } from './roles';
import { users } from './users';

export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);

export const invitations = pgTable(
  'invitations',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    status: invitationStatusEnum('status').default('PENDING').notNull(),
    invitedByUserId: varchar('invited_by_user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uqActiveEmail: uniqueIndex('uq_active_invitation_email')
      .on(t.email)
      .where(sql`status = 'PENDING'`),
    idxExpiresAt: index('idx_invitations_expires_at')
      .on(t.expiresAt)
      .where(sql`status = 'PENDING'`),
  })
);
