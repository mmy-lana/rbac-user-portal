# Master Implementation Checklist

- [ ] Task 1: Environment baseline, types, and DB client initializers
  - [ ] Initialize Turborepo root workspace with `pnpm-workspace.yaml`, `.npmrc`, and `turbo.json`.
  - [ ] Setup `packages/tsconfig` with strict root and node/react base configuration templates.
  - [ ] Setup `packages/shared` with standardized DTO schemas, enumerations, constants, and API response wrappers.
  - [ ] Configure `packages/database` with Neon serverless connection, Drizzle schema, migration generator, and standalone seed script.
  - [ ] Validate connection pooling and migration scripts targeting Neon PostgreSQL.

- [ ] Task 2: Core design system primitives and atomic UI components
  - [ ] Initialize `packages/ui` and configure Tailwind CSS v4 design tokens adhering to the Vault theme.
  - [ ] Implement `VaultButton` primitive with states: normal, active, focus, disabled, loading, destructive.
  - [ ] Implement `VaultInput` primitive with explicit error status, helper texts, and 44px min touch target.
  - [ ] Implement `VaultCard` and `VaultBadge` supporting security severity tokens.
  - [ ] Implement `VaultModal` with accessible focus-trapping, backdrop blur, and viewport adaptability.
  - [ ] Implement responsive data view primitive transforming between standard tabular view and compact stack view.

- [ ] Task 3: Feature Module 1 (Auth & RBAC) end-to-end implementation
  - [ ] Build NestJS `UsersModule` and `AuthModule` with bcrypt password hashing (12 rounds).
  - [ ] Implement `JwtStrategy`, `JwtRefreshStrategy`, and associated passport authentication guards.
  - [ ] Create `@Roles()`, `@Permissions()`, and `@Public()` decorators along with default-deny `RbacGuard`.
  - [ ] Implement auth endpoints: `POST /login`, `POST /refresh`, `POST /logout`, and `GET /me`.
  - [ ] Implement frontend `auth-store` with Zustand and TanStack Query authentication hooks.
  - [ ] Build vault login screen meeting all viewport specifications without hover dependencies.

- [ ] Task 4: Feature Module 2 (User Invitations Portal) end-to-end implementation
  - [ ] Create database models and migrations for the `invitations` table with cryptographically secure tokens.
  - [ ] Implement NestJS `InvitationsModule` with token dispatch, validation, revocation, and expiration logic.
  - [ ] Implement invitation API endpoints with full RBAC protection (Owner/Admin roles only).
  - [ ] Implement invitation acceptance pipeline: token validation, user creation, role binding, and automated login.
  - [ ] Construct the Admin Invitation Management UI with real-time status filtering and revocation action buttons.
  - [ ] Construct the Public Invitation Claim interface ensuring responsive layout across 360px to 1024px+ viewports.

- [ ] Task 5: Audit logging and security telemetry implementation
  - [ ] Implement system audit logging service tracking invitation lifecycle events and role transitions.
  - [ ] Implement global HTTP exception filter and request transformation interceptor across NestJS.
  - [ ] Enforce rate-limiting throttler rules on public authentication and invitation claim routes.
  - [ ] Verify reverse proxy header trust and client IP extraction.

- [ ] Task 6: Routing shell, responsive page assembly, and production build verification
  - [ ] Build application shell layout including responsive header, security context indicators, and session termination handler.
  - [ ] Wire up React Router routes with permission-aware route wrappers (`ProtectedRoute`).
  - [ ] Verify complete layout responsiveness against strict viewport sizes: 360px, 390px, 430px, 768px, and 1024px+.
  - [ ] Validate touch target criteria (minimum 44x44px bounding boxes) across all interactive triggers.
  - [ ] Execute full production builds: `turbo run build` targeting Vercel (FE) and Render (BE).
