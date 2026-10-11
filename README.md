# RBAC User Invitation Portal

A closed-registration, zero-trust Role-Based Access Control (RBAC) portal featuring cryptographically secure invitation workflows, hierarchical authorization, dual-token JWT authentication, and append-only audit logging.

---

## System Overview

Public self-registration is disabled. All user provisioning must originate from an authorized administrator via an out-of-band invitation link.

### Role Hierarchy & Permissions

| Role | Hierarchy Rank | Capabilities |
| :--- | :--- | :--- |
| `OWNER` | Rank 3 | Superuser. Wildcard authority across all resources. Seeded at bootstrap. |
| `ADMIN` | Rank 2 | Manages user invitations (`create`, `read`, `revoke`) and views user directories. |
| `AUDITOR` | Rank 1 | Read-only compliance observer. Inspects user directory, invitation ledger, and audit telemetry. |
| `MEMBER` | Rank 0 | Standard operational identity. Access limited to basic directory inspection. |

Hierarchical Constraints:
- An actor cannot issue an invitation for a role equal to or greater than their own clearance (`outranks(actor.role, targetRole)`).
- The `OWNER` role cannot be provisioned via invitations.

---

## Core Workflows

1. **Bootstrap & Sign-in:**
   - On initial database seeding, an active `OWNER` account is provisioned (`owner@vault.internal`).
   - The owner signs in at `/login` using the seeded passphrase.
2. **Invitation Dispatch:**
   - `OWNER` or `ADMIN` navigates to `/` and issues an invitation for a target email and role.
   - The server creates an invitation record with a 32-byte cryptographic token (hashed with SHA-256 in the database) valid for 72 hours.
   - The raw invitation link (`/invitations/accept/<token>`) is generated.
3. **Invitation Acceptance (Self-Service Credentialing):**
   - The invitee accesses `/invitations/accept/<token>`.
   - The page validates the token using constant-time delay padding (100ms) to prevent timing side-channel attacks.
   - The invitee provides their name and sets their own password.
   - The user account is provisioned, the invitation is marked `ACCEPTED`, and dual tokens are issued within a single atomic database transaction.
4. **Audit Trail (Security Telemetry):**
   - Privilege changes, authentication events, session terminations, and invitation lifecycle transitions are appended to `audit_logs` and accessible at `/audit` by authorized roles (`OWNER`, `ADMIN`, `AUDITOR`).

---

## Technical Stack

- **Monorepo:** Turborepo, pnpm workspaces
- **Frontend (`apps/web`):** React, Vite, Tailwind CSS v4, TanStack Query, Zustand, React Router
- **Backend (`apps/api`):** NestJS, Passport, JWT, Throttler, class-validator
- **Database (`packages/database`):** PostgreSQL 16 (via Docker Compose / node-postgres), Drizzle ORM
- **Shared Package (`packages/shared`):** Canonical DTOs, interfaces, and permission validation utilities
- **UI Package (`packages/ui`):** Headless and token-driven design system primitives

---

## Getting Started

### Prerequisites

- Node.js 22 LTS or later
- pnpm (latest)
- Docker and Docker Compose

### Local Development Setup

1. **Clone repository and configure environment:**
   ```bash
   cp .env.example .env
   ```

2. **Launch development stack:**
   ```bash
   pnpm dev
   ```
   *This command automatically starts the PostgreSQL container, applies database migrations, seeds initial RBAC roles/permissions, provisions the root `OWNER`, and starts both backend (port 3000) and frontend (port 5173).*

3. **Application Endpoints:**
   - Web Console: `http://localhost:5173`
   - API Gateway: `http://localhost:3000/api/v1` (also proxied via `http://localhost:5173/api/v1`)
   - Health Probe: `http://localhost:3000/health`

4. **Default Root Credentials:**
   - Identity: `owner@vault.internal`
   - Passphrase: `CorrectHorseBatteryStaple2026!`

---

## Available Scripts

- `pnpm dev`: Boots Docker database, runs migrations/seeds, and launches Turborepo development processes.
- `pnpm build`: Executes production build across all monorepo packages.
- `pnpm typecheck`: Runs strict TypeScript type-checking across all applications and packages.
- `pnpm docker:up`: Starts local PostgreSQL container in detached mode.
- `pnpm docker:down`: Stops local PostgreSQL container.
- `pnpm db:setup`: Re-runs database migrations and seed script.
