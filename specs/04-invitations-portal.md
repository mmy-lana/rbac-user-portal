# User Invitations Portal Specification

## Feature Domain Model

The Invitation Lifecycle engine handles secure onboarding of new enterprise users through single-use, high-entropy invitation links without pre-registering blank passwords.

- `Invitation`: Record containing destination `email`, target `roleId`, SHA-256 hashed cryptographically generated invitation token, `status` (`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`), expiration threshold (fixed 72 hours), and tracking for the issuing administrative identity (`invitedByUserId`).

## State Lifecycle

1. `Draft / Issued`: Admin specifies target email and role. Server generates a 32-byte secure hexadecimal string (`crypto.randomBytes(32).toString('hex')`). Token is hashed using SHA-256 before persisting in the database (`token_hash`). Raw link dispatched: `https://vault.domain.com/invitations/accept/<rawToken>`. Query parameter token transmission is prohibited to prevent access log leakage.
2. `Valid / Pending`: Link accessed within 72 hours. Status is `PENDING`.
3. `Accepted`: Invitee completes registration form. The entire acceptance pipeline — user record creation, password hashing (bcrypt, 12 rounds), setting invitation status to `ACCEPTED`, updating `accepted_at`, and emitting the audit log entry — executes within a single database transaction. Session tokens are issued only after transaction commit.
4. `Revoked`: Admin cancels invitation before redemption. Status changed to `REVOKED`. Any subsequent attempt to access link yields an explicit security notice.
5. `Expired`: Timestamp exceeds 72 hours. Status automatically computed or transitioned to `EXPIRED`.

## Controller Route Registration Order
In `InvitationsController`, routes must be registered in strict order to avoid parameter shadowing:
1. `GET /api/v1/invitations` (`findAll`)
2. `GET /api/v1/invitations/validate/:token` (`validateToken`, decorated with `@Public()`)
3. `POST /api/v1/invitations/accept/:token` (`acceptInvitation`, decorated with `@Public()`)
4. `POST /api/v1/invitations` (`create`)
5. `DELETE /api/v1/invitations/:id` (`revoke`)

## API Endpoints

### POST `/api/v1/invitations`
- Headers: `Authorization: Bearer <accessToken>` (Requires role `OWNER` or `ADMIN`, permission `invitations:create`)
- Body:
```json
{
  "email": "analyst.external@agency.gov",
  "roleId": "rol_00000000-0000-0000-0000-000000000004"
}
```
- Response (201 Created):
```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "id": "inv_12345678-abcd-ef01-2345-6789abcdef01",
    "email": "analyst.external@agency.gov",
    "role": "MEMBER",
    "status": "PENDING",
    "expiresAt": "2026-10-09T03:00:00.000Z",
    "invitationUrl": "https://vault.domain.com/invitations/accept/9f83a628be934c1b9204e12059346d8f1e2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d"
  },
  "error": null,
  "meta": {
    "timestamp": "2026-10-06T03:00:00.000Z",
    "requestId": "req_create_inv_01"
  }
}
```

### GET `/api/v1/invitations`
- Headers: `Authorization: Bearer <accessToken>` (Requires permission `invitations:read`)
- Query Parameters: `page=1&limit=20&status=PENDING`
- Response (200 OK): Contains paginated array of `InvitationEntity`.

### GET `/api/v1/invitations/validate/:token`
- Public endpoint (Rate limited: 10 req/60s/IP, decorated with `@Public()`)
- Timing Attack Defense: Handler enforces a fixed minimum response delay of 100ms via constant-time delay padding across both lookup hits and misses to prevent token enumeration via timing side-channels.
- Data Minimization Guarantee: The target email address is deliberately omitted from the unauthenticated response to avoid leaking identity associations prior to clearance finalization.
- Response (200 OK):
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "role": "MEMBER",
    "isValid": true
  },
  "error": null,
  "meta": {
    "timestamp": "2026-10-06T03:00:00.000Z",
    "requestId": "req_val_inv_03"
  }
}
```

### POST `/api/v1/invitations/accept/:token`
- Public endpoint (Rate limited: 5 req/60s/IP, decorated with `@Public()`)
- Path Parameter: `:token` (extracted via `@Param('token')`)
- Throttling Threat Model: The acceptance endpoint rate limit is IP-scoped only. Token brute-force is mitigated by the 32-byte (256-bit) cryptographically generated high-entropy token space.
- Transport Driver & Transaction Constraint: `InvitationsService.accept()` must acquire a connection from the WebSocket connection pool (`neonPool`). Using the HTTP stateless driver for this interactive multi-statement transaction is prohibited.
- Body:
```json
{
  "firstName": "Elena",
  "lastName": "Rostova",
  "password": "SecurePasswordWithEntropy2026!"
}
```
- Response (201 Created): Generates user account, marks invitation `ACCEPTED`, issues dual tokens, and returns standard auth payload along with authentication cookies.

### DELETE `/api/v1/invitations/:id`
- Headers: `Authorization: Bearer <accessToken>` (Requires permission `invitations:revoke`)
- Path Parameter: `:id` (extracted via `@Param('id')`)
- Response (200 OK): `{ "success": true, "statusCode": 200, "data": { "revoked": true }, "error": null, "meta": { "timestamp": "...", "requestId": "..." } }`

## Responsive Screen Layout & Behaviors

### 1. Invitation Management Portal (Admin View)
- Viewport `360px`, `390px`, `430px`:
  - Search bar and role filter stack vertically, full-width inputs (min height 44px).
  - Primary "Issue Invitation" trigger sticks to the bottom of the viewport as a fixed vault action bar with `padding-bottom: env(safe-area-inset-bottom, 16px)` and `min-height: calc(48px + env(safe-area-inset-bottom, 0px))` to prevent mobile browser chrome occlusion.
  - Table transforms into individual `VaultCard` records displaying:
    - Target email in monospace text.
    - Status badge and assigned role badge side-by-side.
    - Expiration date countdown.
    - Action Zone: For identities with `invitations:revoke` permission, a "Revoke" button spans full card width (`min-h-[44px]`). For identities without `invitations:revoke` permission (such as `AUDITOR`), the action zone renders an immutable read-only status indicator badge (`min-h-[44px]`, full card width) preserving uniform card dimensions.
- Viewport `768px`:
  - Filters display inline (2 columns).
  - Traditional table rendered with horizontal scroll wrapper if table exceeds viewport width.
  - Sticky table headers with vault borders (`border-b border-vault-border`).
- Viewport `1024px+`:
  - Full tabular desktop view with sortable columns: Target Email, Assigned Role, Status, Inviter, Expiration, and Direct Actions.
  - Revocation and Copy Link actions accessible as distinct icon-text buttons with 44px touch envelopes.

### 2. Acceptance & Account Initialization View (Public View)
- Client Routing Definition (`apps/web/src/routes/router.tsx`):
  - Route mapping: `<Route path="/invitations/accept/:token" element={<AcceptInvitePage />} />`.
  - Token retrieval: The component extracts the raw token parameter strictly via `const { token } = useParams<{ token: string }>()`. Query string extraction (`useSearchParams`) is prohibited.
- UX & Data Minimization Specification:
  - The acceptance form intentionally does not pre-display the target invitee email prior to clearance completion.
  - Email confirmation is displayed on the post-clearance completion screen using the returned `UserEntity.email` from the `POST /api/v1/invitations/accept/:token` payload.
- Viewport `360px` - `430px`:
  - Centered vault card with 100% width, zero horizontal margins, and top security status banner.
  - Fields (First Name, Last Name, Password, Confirm Password) stacked vertically with full-width inputs.
  - Password strength matrix displayed as an 8-bit style progress segment bar.
  - "Finalize Clearance" submit button full-width with a min height of 48px.
- Viewport `768px` - `1024px+`:
  - Floating encrypted vault card centered horizontally and vertically, fixed width of 480px.
  - Background features high-contrast dark noise layer with subtle perimeter border (`border-vault-border`).
