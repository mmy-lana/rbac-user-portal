import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
import type { RefreshSession, RequestWithRefreshSession } from '../interfaces/request.interface';

/**
 * Gate for the refresh endpoint.
 *
 * Unlike `JwtAuthGuard` this guard has **no** `@Public()` bypass: the refresh
 * route is unreachable without a valid refresh cookie, and letting a handler
 * opt out would reintroduce anonymous access to session issuance.
 *
 * On success the rotated session is attached to the request as
 * `refreshSession`, which is what the controller reads to mint the replacement
 * HttpOnly cookie.
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  override handleRequest<TUser = RefreshSession>(
    err: unknown,
    user: TUser,
    info: unknown
  ): TUser {
    if (err instanceof Error) {
      throw err;
    }
    if (!user) {
      throw (
        info instanceof Error
          ? info
          : new UnauthorizedException('Refresh credential is missing or no longer valid.')
      );
    }
    return user;
  }

  override canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithRefreshSession>();

    return Promise.resolve(super.canActivate(context) as boolean | Promise<boolean>).then(
      (activated: boolean) => {
        if (activated) {
          request.refreshSession = request.user as unknown as RefreshSession;
          delete request.user;
        }
        return activated;
      }
    );
  }
}