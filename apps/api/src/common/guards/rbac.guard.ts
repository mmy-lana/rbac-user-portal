import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUserPayload, SystemRole, Permission } from '@rbac/shared';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<SystemRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermissions) {
      throw new ForbiddenException('Access denied: Handler missing required role or permission metadata bindings.');
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUserPayload }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication credentials missing');
    }

    if (user.role === SystemRole.OWNER) {
      return true;
    }

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Insufficient hierarchy level. Required: [${requiredRoles.join(', ')}]`);
    }

    if (requiredPermissions) {
      const hasAllPermissions = requiredPermissions.every((perm) =>
        user.permissions.includes(perm)
      );
      if (!hasAllPermissions) {
        throw new ForbiddenException(`Missing required security entitlements: [${requiredPermissions.join(', ')}]`);
      }
    }

    return true;
  }
}
