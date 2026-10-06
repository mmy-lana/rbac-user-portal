import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Audit module.
 *
 * `@Global()` because auditing is cross-cutting: auth, invitations and any future
 * module must be able to record events without importing a feature module purely
 * to reach the trail writer.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}