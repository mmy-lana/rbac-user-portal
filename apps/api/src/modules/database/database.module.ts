import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { HealthController } from './health.controller';

/**
 * Database module.
 *
 * `@Global()` so feature modules resolve the connection handle through injection
 * instead of importing a driver singleton directly, which keeps the driver choice
 * a single decision made in one place.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}