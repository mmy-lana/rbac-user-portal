# Authentication & Role-Based Access Control Specification

## Feature Domain Model

The Authentication and Role-Based Access Control (RBAC) engine manages identity issuance, session lifetime, permission verification, and credential security.

- `User`: Primary identity verified by credentials.
- `Role`: System role classification with hierarchical mapping (`OWNER` > `ADMIN` > `AUDITOR` > `MEMBER`).
- `Permission`: Fine-grained actions bounded to resources.

### Role-to-Permission Matrix
| System Role | Assigned Permissions |
| :--- | :--- |
| `OWNER` | `users:read`, `users:write`, `users:delete`, `invitations:create`, `invitations:read`, `invitations:revoke`, `audit:read` |
| `ADMIN` | `users:read`, `users:write`, `invitations:create`, `invitations:read`, `invitations:revoke`, `audit:read` |
| `AUDITOR` | `users:read`, `invitations:read`, `audit:read` |
| `MEMBER` | `users:read` |

- Token Payload & Owner Permission Policy:
  - `AuthService.login()` maps `UserEntity.role` to `AuthenticatedUserPayload.role` directly without transformation.
  - When issuing JWT tokens or `/me` payloads for `OWNER` identities, `AuthService` must inject `ALL_PERMISSIONS` directly from `@rbac/shared` to avoid runtime type widening from untyped `Object.values`.
  - The `hasPermission` utility must be exported directly from `packages/shared/src/index.ts` so both backend services and frontend components import it uniformly via `@rbac/shared`:
    ```typescript
    export function hasPermission(
      user: { role: SystemRole; permissions: Permission[] },
      permission: Permission
    ): boolean {
      if (user.role === SystemRole.OWNER) {
        return true;
      }
      return user.permissions.includes(permission);
    }
    ```

### Initial Owner Bootstrap Resolution
To prevent the initial onboarding deadlock where no user exists to create the first invitation:
1. The bootstrap seed script (`packages/database/src/seed.ts`) inspects the `users` table.
2. If zero user records exist, it provisions an initial active root owner identity using configuration values `INITIAL_OWNER_EMAIL` (default: `owner@vault.internal`) and `INITIAL_OWNER_PASSWORD` (hashed with bcrypt, 12 rounds), assigning role `OWNER` (`rol_00000000-0000-0000-0000-000000000001`) with status `ACTIVE`.
3. If users already exist, user provisioning is skipped.

### Database RBAC Seeding Specification
System roles and permissions are initialized deterministically through a dedicated execution script (`packages/database/src/seed.ts`), invoked via `pnpm --filter @rbac/database db:seed`. It is decoupled from Drizzle auto-generated migration directories to eliminate file naming conflicts:
- Client & Decoupling Mandate:
  - `packages/database/src/seed.ts` uses the HTTP stateless Neon driver for its connection.
  - Role and permission string values are declared inline as string literals within `seed.ts` to maintain runtime decoupling from `@rbac/shared`.
  - The script is idempotent and safe to execute repeatedly across deployments.
- Idempotent Seed Definitions (`ON CONFLICT (id) DO NOTHING`):
  - Roles:
    - `rol_00000000-0000-0000-0000-000000000001` -> `OWNER`
    - `rol_00000000-0000-0000-0000-000000000002` -> `ADMIN`
    - `rol_00000000-0000-0000-0000-000000000003` -> `AUDITOR`
    - `rol_00000000-0000-0000-0000-000000000004` -> `MEMBER`
  - Permissions:
    - `prm_00000000-0000-0000-0000-000000000001` -> `users:read`
    - `prm_00000000-0000-0000-0000-000000000002` -> `users:write`
    - `prm_00000000-0000-0000-0000-000000000003` -> `users:delete`
    - `prm_00000000-0000-0000-0000-000000000004` -> `invitations:create`
    - `prm_00000000-0000-0000-0000-000000000005` -> `invitations:read`
    - `prm_00000000-0000-0000-0000-000000000006` -> `invitations:revoke`
    - `prm_00000000-0000-0000-0000-000000000007` -> `audit:read`
- `role_permissions` join table rows are seeded matching the Role-to-Permission Matrix with `ON CONFLICT (role_id, permission_id) DO NOTHING`.

## State Lifecycle

1. `Unauthenticated`: Client holds no tokens or cookies. Redirects all protected routes to `/login`.
2. `Authenticating`: Client submits email and password over HTTPS. Server runs bcrypt comparison.
3. `Active`: Access token held in runtime memory; refresh token set as HttpOnly cookie. User payload bound to Zustand store.
4. `Refreshing`: Interceptor catches 401 response, locks execution queue, dispatches refresh exchange with cookie. Refresh token is single-use: each successful `/refresh` invocation immediately invalidates the consumed refresh token, generates a new cryptographic token, hashes it via bcrypt (12 rounds), updates `users.refresh_token_hash` atomically in the database, and re-issues a new cookie.
5. `Session Expired`: Refresh token invalid or revoked. State resets to `Unauthenticated`, clearing all in-memory keys.

## Guard Implementations

```typescript
import { SetMetadata, ExecutionContext, Injectable, CanActivate, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { AuthenticatedUserPayload, SystemRole } from '@rbac/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<SystemRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Default-deny: If no roles or permissions are explicitly specified on a protected handler, access is denied.
    if (!requiredRoles && !requiredPermissions) {
      throw new ForbiddenException('Access denied: Handler missing required role or permission metadata bindings.');
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUserPayload }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication credentials missing');
    }

    if (user.role === SystemRole.OWNER) {
      return true;
    }

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Insufficient hierarchy level. Required: [${requiredRoles.join(', ')}]`);
    }

    if (requiredPermissions) {
      const hasAllPermissions = requiredPermissions.every((perm) =>
        user.permissions.includes(perm as any)
      );
      if (!hasAllPermissions) {
        throw new ForbiddenException(`Missing required security entitlements: [${requiredPermissions.join(', ')}]`);
      }
    }

    return true;
  }
}
```

## API Endpoints

### POST `/api/v1/auth/login`
- Public endpoint (Rate limited: 5 req/60s/IP, decorated with `@Public()`)
- Body: `{ "email": "admin@vault.internal", "password": "SecurePassword123!" }`
- Sets Cookie: `__Host-vault_refresh_token=<hash>; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`

### POST `/api/v1/auth/refresh`
- Public endpoint (Decorated with `@Public()`, requires `__Host-vault_refresh_token` cookie)
- Rotates refresh token and issues fresh access token.

### POST `/api/v1/auth/logout`
- Headers: `Authorization: Bearer <accessToken>`
- Invalidates database refresh token and unsets cookie.

### GET `/api/v1/auth/me`
- Headers: `Authorization: Bearer <accessToken>`
- Returns `MeResponseDto` with full permissions array.
