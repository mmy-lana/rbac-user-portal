// `emitDecoratorMetadata` only records type metadata; the runtime that reads it
// must be loaded before any decorated class is evaluated.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { loadAppEnvironment } from './config/env';

/**
 * Application bootstrap.
 *
 * Order matters here:
 *  1. `trust proxy` — must be set before anything reads `x-forwarded-for`, or the
 *     rate limiter and audit trail will attribute every request to the proxy.
 *  2. CORS with credentials bound to a single configured origin.
 *  3. Cookie parsing (the refresh token arrives as a cookie).
 *  4. Global validation → global interceptor → global filter, so every response
 *     carries the same envelope and no unvalidated payload reaches a handler.
 */
async function bootstrap(): Promise<void> {
  const env = loadAppEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Silence internal framework inspection noise during development bootstrap
    logger: ['error', 'warn'],
  });

  // Honour exactly one proxy hop (Render terminates TLS in front of us).
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api/v1', {
    // Health probes are served from the root so a platform probe does not have to
    // carry a bearer token.
    exclude: ['health'],
  });

  app.enableCors({
    // With credentials enabled the origin can never be a wildcard. In
    // production we pin to the single configured web origin; in development we
    // accept both localhost/127.0.0.1 variants of the Vite dev server (the
    // Vite proxy already makes the browser same-origin, this covers direct calls).
    origin: env.isProduction
      ? env.webAppOrigin
      : [env.webAppOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Requested-With,X-Request-Id',
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      // Convert payloads to DTO instances and strip any property the DTO does not
      // declare — this is what stops a client smuggling extra fields into a query.
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    })
  );

  app.useGlobalInterceptors(new RequestContextInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Let `DatabaseService.onModuleDestroy` run so pooled sockets are released on
  // deploy and SIGTERM, rather than being severed mid-request.
  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');

  process.stdout.write(`
--------------------------------------------------
  VAULT BACKEND ONLINE -> PORT ${env.port}
  - API Gateway:  http://localhost:${env.port}/api/v1
  - Health Probe: http://localhost:${env.port}/health
  - Web UI:       http://localhost:5173
--------------------------------------------------
\n`);
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`
  );
  process.exit(1);
});