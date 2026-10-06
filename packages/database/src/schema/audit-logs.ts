import { pgTable, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Append-only security telemetry.
 *
 * `actorId` is nullable with `ON DELETE SET NULL`: security history must survive
 * the deletion of the actor it describes. `payload` carries the structured event
 * context and is never used to store credentials or raw claim tokens.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    actorId: varchar('actor_id', { length: 64 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 64 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    resourceId: varchar('resource_id', { length: 64 }).notNull(),
    payload: jsonb('payload').default({}).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_logs_actor').on(table.actorId),
    index('idx_audit_logs_created_at').on(table.createdAt.desc()),
  ]
);