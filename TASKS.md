# Master Implementation Checklist

- [x] Task 1: Environment baseline, types, and DB client initializers
  - [x] Initialize Turborepo root workspace with `pnpm-workspace.yaml`, `.npmrc`, and `turbo.json`.
  - [x] Setup `packages/tsconfig` with strict root and node/react base configuration templates.
  - [x] Setup `packages/shared` with standardized DTO schemas, enumerations, constants, and API response wrappers.
  - [x] Configure `packages/database` with Neon serverless connection, Drizzle schema, migration generator, and standalone seed script.
  - [x] Validate connection pooling and migration scripts targeting Neon PostgreSQL.

- [x] Task 2: Core design system primitives and atomic UI components
  - [x] Initialize `packages/ui` and configure Tailwind CSS v4 design tokens adhering to the Vault theme.
  - [x] Implement `VaultButton` primitive with states: normal, active, focus, disabled, loading, destructive.
  - [x] Implement `VaultInput` primitive with explicit error status, helper texts, and 44px min touch target.
  - [x] Implement `VaultCard` and `VaultBadge` supporting security severity tokens.
  - [x] Implement `VaultModal` with accessible focus-trapping, backdrop blur, and viewport adaptability.
  - [x] Implement responsive data view primitive transforming between standard tabular view and compact stack view.

- [x] Task 3: Feature Module 1 (Auth & RBAC) end-to-end implementation
  - [x] Build NestJS `UsersModule` and `AuthModule` with bcrypt password hashing (12 rounds).
  - [x] Implement `JwtStrategy`, `JwtRefreshStrategy`, and associated passport authentication guards.
  - [x] Create `@Roles()`, `@Permissions()`, and `@Public()` decorators along with default-deny `RbacGuard`.
  - [x] Implement auth endpoints: `POST /login`, `POST /refresh`, `POST /logout`, and `GET /me`.
  - [x] Implement frontend `auth-store` with Zustand and TanStack Query authentication hooks.
  - [x] Build vault login screen meeting all viewport specifications without hover dependencies.

- [x] Task 4: Feature Module 2 (User Invitations Portal) end-to-end implementation
  - [x] Create database models and migrations for the `invitations` table with cryptographically secure tokens.
  - [x] Implement NestJS `InvitationsModule` with token dispatch, validation, revocation, and expiration logic.
  - [x] Implement invitation API endpoints with full RBAC protection (Owner/Admin roles only).
  - [x] Implement invitation acceptance pipeline: token validation, user creation, role binding, and automated login.
  - [x] Construct the Admin Invitation Management UI with real-time status filtering and revocation action buttons.
  - [x] Construct the Public Invitation Claim interface ensuring responsive layout across 360px to 1024px+ viewports.

- [x] Task 5: Audit logging and security telemetry implementation
  - [x] Implement system audit logging service tracking invitation lifecycle events and role transitions.
  - [x] Implement global HTTP exception filter and request transformation interceptor across NestJS.
  - [x] Enforce rate-limiting throttler rules on public authentication and invitation claim routes.
  - [x] Verify reverse proxy header trust and client IP extraction.

- [x] Task 6: Routing shell, responsive page assembly, and production build verification
  - [x] Build application shell layout including responsive header, security context indicators, and session termination handler.
  - [x] Wire up React Router routes with permission-aware route wrappers (`ProtectedRoute`).
  - [x] Verify complete layout responsiveness against strict viewport sizes: 360px, 390px, 430px, 768px, and 1024px+.
  - [x] Validate touch target criteria (minimum 44x44px bounding boxes) across all interactive triggers.
  - [x] Execute full production builds: `turbo run build` targeting Vercel (FE) and Render (BE).

- [x] Task 7: Security audit remediation (Batch 1–3)
  - [x] CONF-01: Development fallback for WEB_APP_ORIGIN in non-production environments.
  - [x] SEC-01: Hierarchical access control on invitation creation (prohibit OWNER dispatch, enforce outranks).
  - [x] SEC-02: Status verification before audit success entry; failure audit for suspended/pending identities.
  - [x] DATA-01: Pagination parameters added to ListInvitationsQueryDto with class-validator decorators.
  - [x] PERF-01: Removed mutating sweepExpiredInvitations() from GET list() path.
  - [x] SEC-03: PostgreSQL 23505 duplicate key error translation to ConflictException.
  - [x] SEC-04: Verified no redundant class-level guards (guards are global via APP_GUARD).
  - [x] API-01: Created ListAuditLogsQueryDto with validated pagination and filter fields.
  - [x] MOB-01: Mobile action bar offset above AppShell bottom tab navigation.
  - [x] SPEC-SYNC: Updated TASKS.md and specs/04-invitations-portal.md with remediation documentation.
