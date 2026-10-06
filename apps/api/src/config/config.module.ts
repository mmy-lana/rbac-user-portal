import { Global, Module } from '@nestjs/common';
import { APP_ENV, loadAppEnvironment } from './env';

/**
 * Global configuration module.
 *
 * `@Global()` is deliberate: configuration is read by strategies, guards,
 * controllers and services alike, and threading an import through every feature
 * module would add coupling without adding safety. Values are resolved exactly
 * once, at bootstrap, so a misconfigured deployment fails immediately instead of
 * on the first request that happens to need the missing key.
 */
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: loadAppEnvironment }],
  exports: [APP_ENV],
})
export class ConfigModule {}