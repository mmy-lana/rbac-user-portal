# RBAC User Invitation Portal - System Architecture

## Topology & Directory Layout

The workspace is configured as a strict Turborepo monorepo managed with pnpm.

```text
rbac-user-portal/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   └── interfaces/
│   │   │   ├── config/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── database/
│   │   │   │   ├── invitations/
│   │   │   │   └── users/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   └── web/
│       ├── public/
│       ├── src/
│       │   ├── assets/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── invitations/
│       │   │   └── users/
│       │   ├── hooks/
│       │   ├── routes/
│       │   ├── styles/
│       │   ├── app.tsx
│       │   ├── index.html
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   ├── database/
│   │   ├── migrations/
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   ├── client.ts
│   │   │   ├── seed.ts
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared/
│   │   ├── src/
│   │   │   ├── constants/
│   │   │   ├── dto/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── ui/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tsconfig/
│       ├── base.json
│       ├── nest.json
│       ├── react.json
│       └── package.json
├── .env.example
├── .gitignore
├── .npmrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
└── turbo.json
```

## Toolchain & Workspace Configuration

- Workspace Orchestrator: Turborepo (latest)
- Package Manager: pnpm (latest) configured in `.npmrc` with `strict-peer-dependencies=true` and `auto-install-peers=true`
- Workspace Manifest (`pnpm-workspace.yaml`):
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- Monorepo Interop & Workspace Dependency Graph:
  - `apps/api/package.json`:
    - `"dependencies": { "@rbac/database": "workspace:*", "@rbac/shared": "workspace:*" }`
    - `"devDependencies": { "@rbac/tsconfig": "workspace:*" }`
  - `apps/web/package.json`:
    - `"dependencies": { "@rbac/shared": "workspace:*", "@rbac/ui": "workspace:*" }`
    - `"devDependencies": { "@rbac/tsconfig": "workspace:*" }`
  - `packages/ui/package.json`:
    - `"name": "@rbac/ui"`
    - `"peerDependencies": { "react": "latest", "react-dom": "latest" }`
    - `"dependencies": { "@rbac/shared": "workspace:*" }` (Required at runtime for `hasPermission` evaluations and `SystemRole`/`SystemPermissions` token mappings)
    - `"devDependencies": { "@rbac/tsconfig": "workspace:*" }`
  - `packages/database/package.json`:
    - `"name": "@rbac/database"`
    - Decoupled from application runtime types; no runtime dependency on `@rbac/shared`. Schema models declare native Drizzle `pgEnum` string literals directly. May declare `"devDependencies": { "@rbac/shared": "workspace:*", "@rbac/tsconfig": "workspace:*" }` for constant access during seed compilation.
  - `packages/shared/package.json`:
    - `"name": "@rbac/shared"`
    - `"devDependencies": { "@rbac/tsconfig": "workspace:*" }`
  - `packages/tsconfig/package.json`:
    - `"name": "@rbac/tsconfig"`
    - `"exports": { "./base.json": "./base.json", "./nest.json": "./nest.json", "./react.json": "./react.json" }`
  - Shared TypeScript Config Usage:
    - Consuming package configurations extend workspace presets via package identifier:
      - `apps/api/tsconfig.json` declares `"extends": "@rbac/tsconfig/nest.json"`.
      - `apps/web/tsconfig.json` declares `"extends": "@rbac/tsconfig/react.json"`.
      - Packages declare `"extends": "@rbac/tsconfig/base.json"`.
  - Path mappings are scoped per package hierarchy:
    - `apps/*/tsconfig.json` declares `"paths": { "@rbac/shared": ["../../packages/shared/src/index.ts"] }`.
    - `packages/ui/tsconfig.json` declares `"paths": { "@rbac/shared": ["../shared/src/index.ts"] }`.
- Turborepo Pipeline (`turbo.json`):
  ```json
  {
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
      "db:generate": {
        "inputs": ["src/schema/**", "drizzle.config.ts"],
        "outputs": ["migrations/**"],
        "cache": true
      },
      "db:migrate": {
        "dependsOn": ["^db:generate"],
        "inputs": ["migrations/**"],
        "cache": false
      },
      "db:seed": {
        "dependsOn": ["^db:migrate"],
        "inputs": ["src/seed.ts"],
        "cache": false
      },
      "build": {
        "dependsOn": ["^build"],
        "outputs": ["dist/**", ".next/**"]
      },
      "api#build": {
        "dependsOn": ["^build", "@rbac/database#db:migrate"],
        "outputs": ["dist/**"]
      },
      "lint": {},
      "test": {}
    }
  }
  ```
- Base Configurations:
  - `packages/tsconfig/base.json`:
    ```json
    {
      "$schema": "https://json.schemastore.org/tsconfig",
      "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "strictBindCallApply": true,
        "strictPropertyInitialization": true,
        "noImplicitThis": true,
        "alwaysStrict": true,
        "noUncheckedIndexedAccess": true,
        "noImplicitOverride": true,
        "exactOptionalPropertyTypes": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
      }
    }
    ```
  - `packages/tsconfig/nest.json`:
    ```json
    {
      "$schema": "https://json.schemastore.org/tsconfig",
      "extends": "./base.json",
      "compilerOptions": {
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true
      }
    }
    ```
  - `packages/tsconfig/react.json`:
    ```json
    {
      "$schema": "https://json.schemastore.org/tsconfig",
      "extends": "./base.json",
      "compilerOptions": {
        "jsx": "react-jsx",
        "module": "ESNext",
        "moduleResolution": "Bundler"
      }
    }
    ```
  - `apps/web/vite.config.ts`:
    ```typescript
    import { defineConfig } from 'vite';
    import react from '@vitejs/plugin-react';
    import tailwindcss from '@tailwindcss/vite';

    export default defineConfig({
      plugins: [react(), tailwindcss()],
    });
    ```
  - `apps/api/nest-cli.json`:
    ```json
    {
      "$schema": "https://json.schemastore.org/nest-cli",
      "collection": "@nestjs/schematics",
      "sourceRoot": "src",
      "compilerOptions": {
        "deleteOutDir": true
      }
    }
    ```
- Backend Runtime: Node.js 22 LTS, NestJS (latest)
- Frontend Framework: React (latest), Vite (latest), TypeScript (latest)
- Styling Engine: Tailwind CSS (v4 latest) using native `@theme` directives. PostCSS-based Tailwind config is prohibited. Integration is exclusively via `@tailwindcss/vite` declared in `vite.config.ts`.
- Compilers: `tsc` for API, `esbuild` within Vite for Web
- Static Analysis & Typing Rules:
  - Compiler options: `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`, `"strictFunctionTypes": true`, `"strictBindCallApply": true`, `"strictPropertyInitialization": true`, `"noImplicitThis": true`, `"alwaysStrict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"exactOptionalPropertyTypes": true`.
  - Indexed Access Rule: Due to `noUncheckedIndexedAccess: true`, all indexed Drizzle result accesses must be null-guarded or use `.at(0)` with explicit undefined checks before accessing member properties.
  - Object Spread Prohibition: Due to `exactOptionalPropertyTypes: true`, explicit property assignment is required on DB insert and update objects; object spread from DTOs into database schema types is prohibited.

## Global Data Layer

- Database Engine: Neon Serverless PostgreSQL
- Driver & ORM: `@neondatabase/serverless` with Drizzle ORM (latest)
- Client Initialization: WebSockets enabled for transaction-capable connection pools on server runtimes; HTTP stateless driver for short-lived requests.
- Client State (Frontend):
  - Remote Server State: `@tanstack/react-query` (latest) with 5-minute garbage collection, 1-minute stale time, and retry policy capped at 2 attempts for idempotency.
  - Client Session State: `zustand` (latest) storing authentication status, active user metadata, and active enterprise tenant information with zero secrets in `localStorage`.
- Unified REST Protocol & Transport Envelope:
  ```typescript
  export interface ApiResponseEnvelope<T> {
    success: boolean;
    statusCode: number;
    data: T | null;
    error: {
      code: string;
      message: string;
      details: Record<string, unknown> | null;
    } | null;
    meta: {
      timestamp: string;
      requestId: string;
      pagination?: {
        totalRecords: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    };
  }
  ```

## Security & Constraints

- Authentication Paradigm: JWT Dual-Token Standard.
  - Access Token: RS256 or HS256 signed token containing `sub` (userId), `email`, `role`, and assigned `permissions`. Lifetime: 15 minutes. Sent via `Authorization: Bearer <token>` header.
  - Refresh Token: High-entropy cryptographic token hashed via `bcrypt` (12 salt rounds) in the database. Lifetime: 7 days. Stored exclusively in a secure, `HttpOnly`, `SameSite=Strict`, `Secure` cookie.
- Guard Chain (NestJS):
  1. `JwtAuthGuard`: Verifies JWT integrity and token expiry. Extracts and attaches user identity to the execution context. Respects `@Public()` bypass.
  2. `RbacGuard`: Reads required role and granular permissions via NestJS `Reflector` metadata (`@Roles`, `@Permissions`). Default-deny security posture.
- Error Handling & Boundaries:
  - API: Global `HttpExceptionFilter` intercepts all thrown errors, captures stack traces internally, and produces a sanitized `ApiResponseEnvelope` avoiding leak of database structure or internal exceptions.
  - Frontend: Root-level and route-level React Error Boundaries catching render-time errors with a cryptographic-vault fallback screen providing session reset capabilities.
- Proxy Configuration & Client IP Extraction:
  - NestJS runtime must enable proxy trust in `apps/api/src/main.ts`: `app.getHttpAdapter().getInstance().set('trust proxy', 1)`.
  - Client IP for rate-limiting and audit log telemetry must be extracted from the first comma-separated token in `x-forwarded-for` with fallback to `req.socket.remoteAddress`.
  - Implementation Note: Under `noUncheckedIndexedAccess: true`, `split(',')[0]` resolves to `string | undefined`. The optional chaining on `?.trim()` satisfies strict indexing and must not be removed:
    ```typescript
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof rawForwarded === 'string'
      ? rawForwarded.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1'
      : req.socket.remoteAddress || '127.0.0.1';
    ```
- Rate Limiting:
  - `@nestjs/throttler` (latest) configured at the gateway level.
  - Storage Backend: `ThrottlerModule` must be initialized with an explicit store. For single-instance Render deployments, `ThrottlerStorageMemoryService` is designated; horizontal scaling beyond one replica requires migrating the storage provider to Redis (`throttler-storage-redis`).
  - Auth routes (`/api/v1/auth/*`): 5 requests per 60 seconds per IP.
  - Invitation claim endpoints (`/api/v1/invitations/accept/:token`): 5 requests per 60 seconds per IP.
  - General authenticated API endpoints: 100 requests per 60 seconds per IP.
- Cross-Origin Resource Sharing (CORS):
  - Strictly bound to environment configuration (`WEB_APP_ORIGIN`).
  - Allowed Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
  - Allowed Headers: `Content-Type`, `Authorization`, `X-Requested-With`, `X-Request-Id`.
  - Credentials: `true`.

## Deployment Runbook & Bootstrap Operation

- Fresh environment bootstrap sequence:
  1. Generate database schema: `pnpm --filter @rbac/database db:generate`
  2. Execute migrations: `pnpm --filter @rbac/database db:migrate`
  3. Execute one-time idempotent bootstrap seed: `pnpm --filter @rbac/database db:seed`
  4. Build application binaries: `turbo run build`
