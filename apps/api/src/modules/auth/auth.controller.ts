import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUserPayload, ApiResponseEnvelope } from '@rbac/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseEnvelope<unknown>> {
    const validatedUser = await this.authService.validateUserCredentials(body.email, body.password);
    const session = await this.authService.createSession(validatedUser);

    res.cookie('__Host-vault_refresh_token', session.refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      statusCode: 200,
      data: {
        user: session.user,
        tokens: {
          accessToken: session.accessToken,
          expiresIn: session.expiresIn,
        },
      },
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseEnvelope<unknown>> {
    const rawToken = req.cookies['__Host-vault_refresh_token'] as string;
    const session = await this.authService.rotateSession(rawToken);

    res.cookie('__Host-vault_refresh_token', session.refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      statusCode: 200,
      data: {
        tokens: {
          accessToken: session.accessToken,
          expiresIn: session.expiresIn,
        },
      },
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseEnvelope<unknown>> {
    await this.authService.terminateSession(user.userId);
    res.clearCookie('__Host-vault_refresh_token', { path: '/' });

    return {
      success: true,
      statusCode: 200,
      data: { revoked: true },
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUserPayload): Promise<ApiResponseEnvelope<unknown>> {
    const details = await this.authService.getMe(user.userId);
    return {
      success: true,
      statusCode: 200,
      data: details,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }
}
