import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from './audit.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolveRequestId } from '../../common/interfaces/request.interface';
import {
  SystemPermissions,
  buildPaginationMeta,
  listEnvelope,
  type ApiResponseEnvelope,
} from '@rbac/shared';

/**
 * Read-only access to the security trail.
 *
 * Guarded exclusively by `audit:read`, which OWNER, ADMIN and AUDITOR hold and
 * MEMBER does not. There is no write route here: audit rows are append-only by
 * construction, produced by the services that performed the action.
 */
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions(SystemPermissions.AUDIT_READ)
  @Get()
  async list(
    @Query()
    query: {
      page?: string;
      limit?: string;
      action?: string;
      resourceType?: string;
      search?: string;
    },
    @Req() request: Request
  ): Promise<ApiResponseEnvelope<unknown>> {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20));

    const result = await this.auditService.list({
      page,
      limit,
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.search ? { search: query.search } : {}),
    });

    return listEnvelope(
      result.entries,
      buildPaginationMeta(result.total, page, limit),
      { requestId: resolveRequestId(request) }
    );
  }
}