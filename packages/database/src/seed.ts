import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcrypt';
import * as path from 'node:path';
import { config as loadEnvFile } from 'dotenv';

// Resolve `.env` from the package root first, then the repo root, so seeding
// behaves identically whether it runs under turbo, pnpm, or directly.
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
loadEnvFile({ path: path.join(packageRoot, '.env'), override: false, quiet: true });
loadEnvFile({ path: path.join(repoRoot, '.env'), override: false, quiet: true });
import * as schema from './schema/index';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  throw new Error('DATABASE_URL is not set for seed script.');
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function runSeed() {
  const rolesList = [
    { id: 'rol_00000000-0000-0000-0000-000000000001', name: 'OWNER' as const, description: 'Superuser with full authority' },
    { id: 'rol_00000000-0000-0000-0000-000000000002', name: 'ADMIN' as const, description: 'Administrative manager' },
    { id: 'rol_00000000-0000-0000-0000-000000000003', name: 'AUDITOR' as const, description: 'Compliance security auditor' },
    { id: 'rol_00000000-0000-0000-0000-000000000004', name: 'MEMBER' as const, description: 'General operational member' },
  ];

  for (const role of rolesList) {
    await db.insert(schema.roles).values(role).onConflictDoNothing();
  }

  const permissionsList = [
    { id: 'prm_00000000-0000-0000-0000-000000000001', action: 'users:read', resource: 'users', description: 'Read users' },
    { id: 'prm_00000000-0000-0000-0000-000000000002', action: 'users:write', resource: 'users', description: 'Write users' },
    { id: 'prm_00000000-0000-0000-0000-000000000003', action: 'users:delete', resource: 'users', description: 'Delete users' },
    { id: 'prm_00000000-0000-0000-0000-000000000004', action: 'invitations:create', resource: 'invitations', description: 'Create invitations' },
    { id: 'prm_00000000-0000-0000-0000-000000000005', action: 'invitations:read', resource: 'invitations', description: 'Read invitations' },
    { id: 'prm_00000000-0000-0000-0000-000000000006', action: 'invitations:revoke', resource: 'invitations', description: 'Revoke invitations' },
    { id: 'prm_00000000-0000-0000-0000-000000000007', action: 'audit:read', resource: 'audit', description: 'Read audit log' },
  ];

  for (const perm of permissionsList) {
    await db.insert(schema.permissions).values(perm).onConflictDoNothing();
  }

  const rolePermissionBindings: Array<{ roleId: string; permissionId: string }> = [
    // OWNER
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000001' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000002' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000003' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000004' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000005' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000006' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000001', permissionId: 'prm_00000000-0000-0000-0000-000000000007' },
    // ADMIN
    { roleId: 'rol_00000000-0000-0000-0000-000000000002', permissionId: 'prm_00000000-0000-0000-0000-000000000001' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000002', permissionId: 'prm_00000000-0000-0000-0000-000000000002' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000002', permissionId: 'prm_00000000-0000-0000-0000-000000000004' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000002', permissionId: 'prm_00000000-0000-0000-0000-000000000005' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000002', permissionId: 'prm_00000000-0000-0000-0000-000000000006' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000002', permissionId: 'prm_00000000-0000-0000-0000-000000000007' },
    // AUDITOR
    { roleId: 'rol_00000000-0000-0000-0000-000000000003', permissionId: 'prm_00000000-0000-0000-0000-000000000001' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000003', permissionId: 'prm_00000000-0000-0000-0000-000000000005' },
    { roleId: 'rol_00000000-0000-0000-0000-000000000003', permissionId: 'prm_00000000-0000-0000-0000-000000000007' },
    // MEMBER
    { roleId: 'rol_00000000-0000-0000-0000-000000000004', permissionId: 'prm_00000000-0000-0000-0000-000000000001' },
  ];

  for (const binding of rolePermissionBindings) {
    await db.insert(schema.rolePermissions).values(binding).onConflictDoNothing();
  }

  const existingUsers = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
  const userCount = existingUsers[0]?.count ?? 0;

  if (userCount === 0) {
    const ownerEmail = process.env.INITIAL_OWNER_EMAIL || 'owner@vault.internal';
    const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'CorrectHorseBatteryStaple2026!';
    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    await db.insert(schema.users).values({
      id: 'usr_00000000-0000-0000-0000-000000000001',
      email: ownerEmail,
      passwordHash: passwordHash,
      firstName: 'Root',
      lastName: 'Owner',
      roleId: 'rol_00000000-0000-0000-0000-000000000001',
      status: 'ACTIVE',
    }).onConflictDoNothing();
  }
}

runSeed()
  .then(() => pool.end())
  .catch(async (err) => {
    process.stderr.write(`${err.message}\n`);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
