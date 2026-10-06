import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';
import * as schema from './schema/index';

const databaseUrl = process.env.DATABASE_URL || '';
const databasePoolUrl = process.env.DATABASE_POOL_URL || databaseUrl;

export const httpSql = neon(databaseUrl);
export const db = drizzle(httpSql, { schema });

export const neonPool = new Pool({ connectionString: databasePoolUrl });
export const poolDb = drizzleServerless(neonPool, { schema });
