import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { AuditModule } from './modules/audit/audit.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { ConfigModule } from './config/config.module';
import { loadAppEnvironment } from './config/env';

@Module({
  imports: [
    ConfigModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const env = loadAppEnvironment();
        return {
          throttlers: [
            // Credential-stuffing surface.
            { name: 'auth', ttl: env.rateLimits.auth.ttl, limit: env.rateLimits.auth.limit },
            // Token-guessing surface on the claim endpoint.
            {
              name: 'invitation-claim',
              ttl: env.rateLimits.invitationClaim.ttl,
              limit: env.rateLimits.invitationClaim.limit,
            },
            // Read-only token probe: cheaper than a claim, so a wider budget.
            {
              name: 'invitation-validate',
              ttl: env.rateLimits.invitationClaim.ttl,
              limit: 10,
            },
            { name: 'general', ttl: env.rateLimits.general.ttl, limit: env.rateLimits.general.limit },
          ],
          /*
           * Explicit storage instance.
           *
           * `ThrottlerStorageService` is the in-process store shipped with
           * `@nestjs/throttler` v6 (it replaced `ThrottlerStorageMemoryService` in
           * v5). Declaring it explicitly keeps the deployment contract visible:
           * this backend is safe for a single instance. Scaling past one replica
           * requires a shared store (e.g. `throttler-storage-redis`), otherwise
           * each replica enforces its own independent budget and the effective
           * limit multiplies by the replica count.
           */
          storage: new ThrottlerStorageService(),
        };
      },
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    InvitationsModule,
  ],
  providers: [
    /*
     * Global guard chain, in execution order.
     *
     * Registering these globally — rather than decorating each controller — is
     * what makes the default-deny posture real: a new endpoint is protected the
     * moment it exists, instead of only after someone remembers to annotate it.
     * `@Public()` is the single, auditable escape hatch.
     *
     * `ThrottlerGuard` runs first so a flood is rejected before any credential
     * verification or database work happens.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}