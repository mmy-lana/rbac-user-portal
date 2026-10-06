import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard, Public } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AuthenticatedUserPayload,
  SystemRole,
  SystemPermissions,
  ApiResponseEnvelope,
} from '@rbac/shared';

@Controller('invitations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @Roles(SystemRole.OWNER, SystemRole.ADMIN, SystemRole.AUDITOR)
  @RequirePermissions(SystemPermissions.INVITATIONS_READ)
  async findAll(@Query('page') page = '1', @Query('limit') limit = '20'): Promise<ApiResponseEnvelope<unknown>> {
    const res = await this.invitationsService.listInvitations(parseInt(page, 10), parseInt(limit, 10));
    return {
      success: true,
      statusCode: 200,
      data: res.items,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
        pagination: {
          totalRecords: res.total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(res.total / parseInt(limit, 10)) || 1,
        },
      },
    };
  }

  @Public()
  @Get('validate/:token')
  async validateToken(@Param('token') token: string): Promise<ApiResponseEnvelope<unknown>> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await this.invitationsService.validateToken(token);

    return {
      success: true,
      statusCode: 200,
      data: result,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  @Public()
  @Post('accept/:token')
  @HttpCode(HttpStatus.CREATED)
  async acceptInvitation(
    @Param('token') token: string,
    @Body() body: { firstName: string; lastName: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseEnvelope<unknown>> {
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp =
      typeof rawForwarded === 'string'
        ? rawForwarded.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1'
        : req.socket.remoteAddress || '127.0.0.1';

    const session = await this.invitationsService.acceptInvitation(token, body, clientIp);

    res.cookie('__Host-vault_refresh_token', session.refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      statusCode: 201,
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

  @Post()
  @Roles(SystemRole.OWNER, SystemRole.ADMIN)
  @RequirePermissions(SystemPermissions.INVITATIONS_CREATE)
  async create(
    @Body() body: { email: string; roleId: string },
    @CurrentUser() user: AuthenticatedUserPayload
  ): Promise<ApiResponseEnvelope<unknown>> {
    const result = await this.invitationsService.createInvitation(body, user.userId);
    return {
      success: true,
      statusCode: 201,
      data: result,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  @Delete(':id')
  @Roles(SystemRole.OWNER, SystemRole.ADMIN)
  @RequirePermissions(SystemPermissions.INVITATIONS_REVOKE)
  async revoke(@Param('id') id: string): Promise<ApiResponseEnvelope<unknown>> {
    const result = await this.invitationsService.revokeInvitation(id);
    return {
      success: true,
      statusCode: 200,
      data: result,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }
}
