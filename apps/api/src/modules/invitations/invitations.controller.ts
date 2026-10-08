import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InvitationsService, type RequestTelemetry } from './invitations.service';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  ListInvitationsQueryDto,
} from './dto/invitations.dto';
import { Public } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { APP_ENV, type AppEnvironment } from '../../config/env';
import { Throttle } from '@nestjs/throttler';
import { resolveRequestId } from '../../common/interfaces/request.interface';
import { toStoredIp, extractUserAgent } from '../../common/utils/client-ip.util';
import {
  SystemPermissions,
  SystemRole,
  listEnvelope,
  successEnvelope,
  type AuthenticatedUserPayload,
  type ApiResponseEnvelope,
} from '@rbac/shared';

/**
 * Invitation endpoints.
 *
 * Registration order is load-bearing: `validate/:token` and `accept/:token` are
 * declared before `POST /` so the literal segments are never shadowed by a
 * parameterised route, and `DELETE /:id` is declared last.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    @Inject(APP_ENV) private readonly env: AppEnvironment
  ) {}

  /** `GET /api/v1/invitations` — paginated directory. */
  @RequirePermissions(SystemPermissions.INVITATIONS_READ)
  @Get()
  async findAll(
    @Query() query: ListInvitationsQueryDto,
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<unknown>> {
    const result = await this.invitationsService.list({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
    });

    return listEnvelope(result.items, result.meta, { requestId: resolveRequestId(request) });
  }

  /**
   * `GET /api/v1/invitations/validate/:token` — public token probe.
   *
   * The response carries the assigned role only; the target email is withheld
   * until the claim completes. The service also enforces a constant latency floor
   * so this endpoint cannot be used as a token oracle.
   */
  @Public()
  @Throttle({ 'invitation-validate': { limit: 10, ttl: 60_000 } })
  @Get('validate/:token')
  async validateToken(
    @Param('token') token: string,
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<unknown>> {
    assertTokenShape(token);
    const result = await this.invitationsService.validateToken(token);
    return successEnvelope(result, { requestId: resolveRequestId(request) });
  }

  /**
   * `POST /api/v1/invitations/accept/:token` — public claim pipeline.
   *
   * Creates the account, marks the invitation accepted and issues a session, all
   * but the token minting inside a single transaction (see the service).
   */
  @Public()
  @Throttle({ 'invitation-claim': { limit: 5, ttl: 60_000 } })
  @Post('accept/:token')
  @HttpCode(HttpStatus.CREATED)
  async acceptInvitation(
    @Param('token') token: string,
    @Body() body: AcceptInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<ApiResponseEnvelope<unknown>> {
    assertTokenShape(token);

    const session = await this.invitationsService.accept(token, body, telemetryOf(request));

    // Claiming signs the invitee straight in: the same HttpOnly cookie contract
    // as `/auth/login` applies, so there is exactly one session issuance path.
    response.cookie(this.env.refreshCookieName, session.refreshToken, {
      httpOnly: true,
      // Relaxed outside production: plain-HTTP localhost cannot set a Secure
      // cookie, and browsers would silently drop it (see auth.controller.ts).
      secure: this.env.isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: this.env.refreshTokenTtlMs,
    });

    return successEnvelope(
      {
        user: session.user,
        tokens: { accessToken: session.tokens.accessToken, expiresIn: session.tokens.expiresIn },
      },
      { requestId: resolveRequestId(request) },
      HttpStatus.CREATED
    );
  }

  /** `POST /api/v1/invitations` — dispatch a new invitation. */
  @Roles(SystemRole.OWNER, SystemRole.ADMIN)
  @RequirePermissions(SystemPermissions.INVITATIONS_CREATE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<unknown>> {
    const created = await this.invitationsService.create(body, user, telemetryOf(request));
    return successEnvelope(
      created,
      { requestId: resolveRequestId(request) },
      HttpStatus.CREATED
    );
  }

  /** `DELETE /api/v1/invitations/:id` — revoke a pending invitation. */
  @RequirePermissions(SystemPermissions.INVITATIONS_REVOKE)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<{ revoked: boolean }>> {
    const result = await this.invitationsService.revoke(id, user, telemetryOf(request));
    return successEnvelope(result, { requestId: resolveRequestId(request) });
  }
}

/**
 * Rejects malformed claim tokens before they reach the database.
 *
 * A token is exactly `INVITATION_TOKEN_BYTES * 2` hex characters; anything else
 * cannot match a stored digest, so rejecting it early avoids a pointless query.
 */
function assertTokenShape(token: string): void {
  if (!/^[0-9a-f]{64}$/.test(token)) {
    throw new BadRequestException('This invitation link is malformed.');
  }
}

/** Request attribution for the audit trail. */
function telemetryOf(request: Request): RequestTelemetry {
  return {
    ipAddress: toStoredIp(request),
    userAgent: extractUserAgent(request),
  };
}
