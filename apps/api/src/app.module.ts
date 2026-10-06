import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerStorageMemoryService } from '@nestjs/throttler';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InvitationsModule } from './modules/invitations/invitations.module';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: 60000,
            limit: 100,
          },
        ],
        storage: new ThrottlerStorageMemoryService(),
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    InvitationsModule,
  ],
})
export class AppModule {}
