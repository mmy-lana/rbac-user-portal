import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { ConfigModule } from './config/config.module';
import { loadAppEnvironment } from './config/env';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const env = loadAppEnvironment();
        return {
          throttlers: [
            { name: 'auth', ttl: env.rateLimits.auth.ttl, limit: env.rateLimits.auth.limit },
            {
              name: 'invitation-claim',
              ttl: env.rateLimits.invitationClaim.ttl,
              limit: env.rateLimits.invitationClaim.limit,
            },
            {
              name: 'general',
              ttl: env.rateLimits.general.ttl,
              limit: env.rateLimits.general.limit,
            },
          ],
          /*
           * Explicit storage instance.
           *
           * `ThrottlerStorageService` is the in-process store shipped with
           * `@nestjs/throttler` v6 (it replaced `ThrottlerStorageMemoryService`
           * in v5). It is declared explicitly rather than left to the implicit
           * default so the deployment contract is visible: this backend is
           * single-instance safe. Scaling past one replica requires swapping in
           * a shared store (for example `throttler-storage-redis`), otherwise
           * each replica would enforce its own independent budget.
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
     * Registering both guards globally — rather than decorating controllers —
     * is what makes the default-deny posture real: a new endpoint is protected
     * the moment it exists, instead of only after someone remembers to annotate
     * it. `@Public()` is the single, auditable escape hatch.
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}