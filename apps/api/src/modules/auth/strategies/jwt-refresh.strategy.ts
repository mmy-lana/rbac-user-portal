import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { APP_ENV, type AppEnvironment } from '../../../config/env';

/**
 * Passport plumbing for the opaque refresh token.
 *
 * The access token is a JWT and is verified by `JwtStrategy`. The refresh token
 * is deliberately *not* a JWT: it is 512 bits of cryptographic randomness whose
 * only recoverable form is a bcrypt digest in `users.refresh_token_hash`. A
 * signed refresh token would be stateless and therefore unrevocable, which
 * defeats both the single-use rotation and the server-side termination
 * requirements of the dual-token standard.
 *
 * `passport` assigns `success` / `fail` / `error` onto the strategy instance
 * before invoking `authenticate`, and Nest's `PassportStrategy` mixin appends a
 * callback whose last argument is passport's `done`. This class wires the two
 * together; the verification itself is delegated to
 * `AuthService.rotateRefreshSession`.
 */
type TokenExtractor = (request: Request) => string | null;

type PassportStrategyCallbacks = {
  success: (user: unknown, info?: unknown) => void;
  fail: (info?: unknown) => void;
  error: (error: unknown) => void;
};

/** Shape of the callback `PassportStrategy` appends as the final constructor argument. */
type ValidateBridge = (...params: unknown[]) => void;

/** Passport `done` callback: `(err, user, info)`. */
type DoneCallback = (error: unknown, user?: unknown, info?: unknown) => void;

class OpaqueTokenStrategy {
  public readonly name: string;

  private readonly extract: TokenExtractor;

  private readonly bridge: ValidateBridge;

  constructor(
    options: { name: string; extract: TokenExtractor },
    bridge: ValidateBridge
  ) {
    this.name = options.name;
    this.extract = options.extract;
    this.bridge = bridge;
  }

  authenticate(request: Request): void {
    const callbacks = this as unknown as PassportStrategyCallbacks;

    const done: DoneCallback = (error, user, info) => {
      if (error) {
        // `UnauthorizedException` instances are mapped to 401 by the global filter.
        callbacks.error(error);
        return;
      }
      if (!user) {
        callbacks.fail(info ?? 'REFRESH_TOKEN_INVALID');
        return;
      }
      callbacks.success(user, info);
    };

    const token = this.extract(request);
    if (token === null || token.length === 0) {
      callbacks.fail('REFRESH_TOKEN_MISSING');
      return;
    }

    this.bridge(token, done);
  }
}

/**
 * Strategy named `jwt-refresh`, consumed by `JwtRefreshGuard`.
 *
 * `validate()` performs the complete single-use rotation: verify the presented
 * token against the stored bcrypt digest, atomically replace that digest, and
 * return the replacement session. Because the replacement is a conditional
 * UPDATE, a replayed or concurrently presented token matches zero rows and is
 * rejected as unauthorized.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  OpaqueTokenStrategy,
  'jwt-refresh'
) {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnvironment
  ) {
    super(
      {
        name: 'jwt-refresh',
        extract: (request: Request): string | null => {
          const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
          const value = cookies?.[this.env.refreshCookieName];
          return typeof value === 'string' && value.length > 0 ? value : null;
        },
      }
    );
  }

  override async validate(token: string): Promise<unknown> {
    return this.authService.rotateRefreshSession(token);
  }
}