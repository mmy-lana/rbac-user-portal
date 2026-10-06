/**
 * Query-builder facade.
 *
 * `apps/api` deliberately does not depend on `drizzle-orm` directly: with pnpm's
 * strict `node_modules` layout, a transitive dependency is not resolvable from a
 * dependent package, and re-declaring the ORM in the app would couple the HTTP
 * layer to a storage implementation it should not know about.
 *
 * Re-exporting the Drizzle query primitives here keeps `@rbac/database` as the
 * single data-access boundary: the API imports `eq`, `and`, `desc`, … and the
 * inferred row types from one package, exactly as it imports the schema tables.
 */
export {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
  sum,
} from 'drizzle-orm';

export { alias } from 'drizzle-orm/pg-core';

import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type * as schema from './schema/index';

/**
 * Schema-bound handle types.
 *
 * The generic is filled in here rather than at each call site so consumers never
 * have to import the schema namespace just to annotate a variable, and never get
 * the untyped `Record<string, never>` default that erases relational typing.
 */
export type Database = NeonHttpDatabase<typeof schema>;
export type PooledDatabase = NeonDatabase<typeof schema>;