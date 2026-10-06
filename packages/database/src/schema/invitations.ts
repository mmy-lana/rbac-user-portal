import {
  pgTable,
  varchar,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { roles } from './roles';
import { users } from './users';

export const invitationStatusEnum = pgEnum('invitation_status', [
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
]);

/**
 * Invitation ledger.
 *
 * Only the SHA-256 hex digest of the claim token is persisted — the raw token
 * exists once, in the dispatch payload, and can never be recovered from the row.
 *
 * The partial unique index `uq_active_invitation_email` is the hard guarantee
 * against duplicate live invitations: re-inviting an address that already has a
 * `PENDING` row raises a unique violation instead of silently creating a second
 * claim link.
 */
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
  (table) => [
    index('idx_invitations_token_hash').on(table.tokenHash),
    index('idx_invitations_email').on(table.email),
    index('idx_invitations_status').on(table.status),
    uniqueIndex('uq_active_invitation_email')
      .on(table.email)
      .where(sql`status = 'PENDING'`),
    index('idx_invitations_expires_at')
      .on(table.expiresAt)
      .where(sql`status = 'PENDING'`),
  ]
);