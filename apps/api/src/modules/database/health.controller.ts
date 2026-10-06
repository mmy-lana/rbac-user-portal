import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/guards/jwt-auth.guard';
import { DatabaseService } from './database.service';

/**
 * Platform liveness/readiness probe.
 *
 * Render polls this during deploys. It is `@Public()` and mounted outside the
 * `/api/v1` prefix so a probe needs neither a bearer token nor the API prefix.
 *
 * The database round trip is the point: a process that is up but cut off from
 * Postgres is *not* ready, and reporting 503 keeps the platform from routing
 * traffic into an instance that cannot serve a single query.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up'; uptimeSeconds: number } | { status: 'degraded'; database: 'down'; uptimeSeconds: number }> {
    const uptimeSeconds = Math.round(process.uptime());

    try {
      await this.databaseService.db.execute('SELECT 1');
      return { status: 'ok', database: 'up', uptimeSeconds };
    } catch {
      return { status: 'degraded', database: 'down', uptimeSeconds };
    }
  }
}