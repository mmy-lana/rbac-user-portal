import { ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
import type { AuthenticatedUserPayload } from '@rbac/shared';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * This is the single escape hatch in the guard chain, so it is deliberately a
 * decorator on the handler or controller rather than a convention: every use is
 * greppable, and `@Public()` on a new endpoint is an explicit, reviewable decision
 * that re-opens the default-deny posture.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Verifies the access token and attaches the principal to the request.
 *
 * Registered globally, so a route is authenticated the moment it exists. A
 * `@Public()` route short-circuits to `true`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * Normalises every authentication failure into one exception.
   *
   * Passport distinguishes "no token", "bad signature", "expired" and "malformed";
   * all of them surface to the client as the same 401 so the endpoint cannot be
   * used to probe which part of a presented token was wrong.
   */
  override handleRequest<TUser = AuthenticatedUserPayload>(
    err: unknown,
    user: TUser,
    info: unknown
  ): TUser {
    if (err instanceof Error) {
      throw err;
    }
    if (!user) {
      throw new UnauthorizedException(
        'Authentication is required to access this resource.'
      );
    }
    return user;
  }
}