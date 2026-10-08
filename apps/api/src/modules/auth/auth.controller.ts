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
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, type RequestTelemetry } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  SystemPermissions,
  successEnvelope,
  type ApiResponseEnvelope,
} from '@rbac/shared';
import { APP_ENV, type AppEnvironment } from '../../config/env';
import { resolveRequestId } from '../../common/interfaces/request.interface';
import { toStoredIp, extractUserAgent } from '../../common/utils/client-ip.util';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnvironment
  ) {}

  /**
   * `POST /api/v1/auth/login`
   *
   * Public and throttled to 5 requests / 60s / IP — the credential-stuffing
   * surface. Returns the access token in the body (the client keeps it in memory
   * only) and delivers the refresh token exclusively as an HttpOnly,
   * `SameSite=Strict`, `Secure` cookie.
   */
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<unknown>> {
    const user = await this.authService.validateUserCredentials(
      body.email,
      body.password,
      telemetryOf(request)
    );
    const result = await this.authService.createSession(user);

    this.issueRefreshCookie(response, result.refreshToken);

    return successEnvelope(
      {
        user: result.user,
        principal: result.principal,
        tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
      },
      { requestId: resolveRequestId(request) },
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
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request & { refreshSession?: RefreshSessionShape },
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
      { requestId: resolveRequestId(request) },
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
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<ApiResponseEnvelope<{ revoked: boolean }>> {
    await this.authService.terminateSessionForActor(user.userId, 'logout', telemetryOf(request));
    this.clearRefreshCookie(response);

    return successEnvelope(
      { revoked: true },
      { requestId: resolveRequestId(request) },
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
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<unknown>> {
    const profile = await this.authService.getMe(user.userId);
    return successEnvelope(profile, { requestId: resolveRequestId(request) });
  }

  /**
   * Cookie policy for the refresh token.
   *
   * In production the `__Host-` prefix applies (paired with the prefixed cookie
   * name in `env.ts`): browsers enforce `Secure`, `Path=/`, and no `Domain`,
   * which rules out subdomain cookie-fixation and cookie-tossing.
   *
   * Outside production we relax `Secure` because the local dev stack runs over
   * plain `http://localhost` without a TLS terminator — a `Secure` cookie would
   * be silently dropped by the browser and the refresh flow would never work.
   */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.isProduction,
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

/** Session attached by `JwtRefreshGuard` (structural copy keeps the import light). */
interface RefreshSessionShape {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  principal: unknown;
}

function telemetryOf(request: Request): RequestTelemetry {
  return {
    ipAddress: toStoredIp(request),
    userAgent: extractUserAgent(request),
  };
}