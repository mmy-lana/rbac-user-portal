import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { parseSystemRole, type AuthenticatedUserPayload, type Permission } from '@rbac/shared';
import { APP_ENV, type AppEnvironment } from '../../../config/env';

/**
 * Access-token verification strategy.
 *
 * The token is a short-lived (15 minute) HS256-signed JWT carrying `sub`,
 * `email`, `role` and `permissions`. Because the payload is self-contained,
 * authorisation needs no database round trip; revocation is achieved by the short
 * TTL plus server-side refresh-token termination.
 *
 * `validate()` re-parses the claims instead of trusting the decoded shape: a
 * token signed with a valid key but carrying an unknown role or a malformed
 * permission list is rejected outright rather than coerced into a usable
 * principal.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(APP_ENV) env: AppEnvironment) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
      // Pinning the algorithm list blocks `alg: none` and RS256/HS256 confusion.
      algorithms: ['HS256'],
    });
  }

  override validate(payload: unknown): AuthenticatedUserPayload {
    if (typeof payload !== 'object' || payload === null) {
      throw new UnauthorizedException('Malformed credential bearer.');
    }

    const claims = payload as Record<string, unknown>;
    const userId = claims['sub'];
    const email = claims['email'];
    const role = claims['role'];
    const permissions = claims['permissions'];

    if (typeof userId !== 'string' || userId.length === 0) {
      throw new UnauthorizedException('Malformed credential bearer.');
    }
    if (typeof email !== 'string' || email.length === 0) {
      throw new UnauthorizedException('Malformed credential bearer.');
    }
    if (typeof role !== 'string') {
      throw new UnauthorizedException('Malformed credential bearer.');
    }
    if (!Array.isArray(permissions) || permissions.some((entry) => typeof entry !== 'string')) {
      throw new UnauthorizedException('Malformed credential bearer.');
    }

    /*
     * An unknown role means the token was minted against a contract this build
     * does not implement (schema drift, a rolled-back deployment). It is still
     * a credential problem from the caller's point of view, so it must surface
     * as 401 — letting the parse error escape would report 500 and tell an
     * attacker the token was well formed.
     */
    try {
      return {
        userId,
        email,
        role: parseSystemRole(role),
        permissions: permissions as Permission[],
      };
    } catch {
      throw new UnauthorizedException('Malformed credential bearer.');
    }
  }
}