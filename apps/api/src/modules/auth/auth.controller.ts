import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { AuthService, type LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SystemPermissions, successEnvelope, type ApiResponseEnvelope } from '@rbac/shared';
import { APP_ENV, type AppEnvironment } from '../../config/env';
import type { RefreshSession } from '../../common/interfaces/request.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnvironment
  ) {}

  /**
   * `POST /api/v1/auth/login`
   *
   * Public and rate limited. Returns the access token in the body (the client
   * keeps it in memory only) and delivers the refresh token exclusively as an
   * HttpOnly, `SameSite=Strict`, `Secure` cookie.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: { headers: Record<string, unknown> }
  ): Promise<ApiResponseEnvelope<unknown>> {
    const result = await this.authService.createSession(
      await this.authService.validateUserCredentials(body.email, body.password)
    );

    this.issueRefreshCookie(response, result.refreshToken);

    return successEnvelope(
      {
        user: result.user,
        principal: result.principal,
        tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
      },
      { requestId: readRequestId(request.headers) },
      HttpStatus.OK
    );
  }

  /**
   * `POST /api/v1/auth/refresh`
   *
   * Public with respect to the access token, but gated by `JwtRefreshGuard`.
   * The consumed refresh token is rotated and reissued as a replacement cookie.
   */
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: { headers: Record<string, unknown>; refreshSession?: RefreshSession },
    @Res({ passthrough: true }) response: Response
  ): Promise<ApiResponseEnvelope<unknown>> {
    const session = request.refreshSession;
    if (!session) {
      throw new Error('Refresh session was not attached by JwtRefreshGuard.');
    }

    this.issueRefreshCookie(response, session.refreshToken);

    return successEnvelope(
      {
        principal: session.principal,
        tokens: { accessToken: session.accessToken, expiresIn: session.expiresIn },
      },
      { requestId: readRequestId(request.headers) },
      HttpStatus.OK
    );
  }

  /**
   * `POST /api/v1/auth/logout`
   *
   * Invalidates the stored refresh digest and clears the cookie, so the session
   * dies server-side even if the caller still holds a live access token.
   */
  @RequirePermissions(SystemPermissions.USERS_READ)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: { userId: string },
    @Req() request: { headers: Record<string, unknown> },
    @Res({ passthrough: true }) response: Response
  ): Promise<ApiResponseEnvelope<{ revoked: boolean }>> {
    await this.authService.terminateSession(user.userId);
    this.clearRefreshCookie(response);

    return successEnvelope(
      { revoked: true },
      { requestId: readRequestId(request.headers) },
      HttpStatus.OK
    );
  }

  /**
   * `GET /api/v1/auth/me`
   *
   * Returns the caller's profile with the effective permission list, which the
   * client uses to build its permission-aware navigation.
   */
  @RequirePermissions(SystemPermissions.USERS_READ)
  @Get('me')
  async me(
    @CurrentUser() user: { userId: string },
    @Req() request: { headers: Record<string, unknown> }
  ): Promise<ApiResponseEnvelope<unknown>> {
    const profile = await this.authService.getMe(user.userId);
    return successEnvelope(profile, { requestId: readRequestId(request.headers) });
  }

  /**
   * Cookie policy for the refresh token.
   *
   * The `__Host-` prefix is a browser-enforced contract: the cookie is accepted
   * only when it is `Secure`, scoped to `Path=/`, and carries no `Domain`
   * attribute — which rules out subdomain cookie-fixation and cookie-tossing
   * attacks. Because `Secure` is mandatory under that prefix, a local
   * development origin must be reached over HTTPS (or through a TLS proxy) for
   * the refresh flow to work at all; this is intentional.
   */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: this.env.refreshTokenTtlMs,
    };
  }

  private issueRefreshCookie(response: Response, token: string): void {
    response.cookie(this.env.refreshCookieName, token, this.cookieOptions());
  }

  private clearRefreshCookie(response: Response): void {
    const { maxAge: _maxAge, ...options } = this.cookieOptions();
    response.clearCookie(this.env.refreshCookieName, options);
  }
}

/** Echoes the inbound correlation id so client and server logs can be joined. */
function readRequestId(headers: Record<string, unknown>): string {
  const raw = headers['x-request-id'];
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 128) return raw;
  return `req_${crypto.randomUUID()}`;
}