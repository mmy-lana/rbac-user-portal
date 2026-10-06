import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUserPayload } from '@rbac/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'vault_insecure_access_secret_development_minimum_32_bytes_entropy',
    });
  }

  validate(payload: AuthenticatedUserPayload) {
    if (!payload.userId || !payload.role) {
      throw new UnauthorizedException('Malformed credential bearer');
    }
    return payload;
  }
}
