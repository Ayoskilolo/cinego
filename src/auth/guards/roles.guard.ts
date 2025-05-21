import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      // If no roles are specified, access is granted
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const { user } = request; // User object should be populated by AuthGuard

    // This check ensures that AuthGuard has run and attached the user object.
    if (!user) {
      throw new UnauthorizedException(
        'User not authenticated or user details not found on request. Ensure AuthGuard is active.',
      );
    }

    // This check ensures the user object has a role property.
    if (!user.role) {
      throw new ForbiddenException('User role is not defined. Access denied.');
    }

    const hasPermission = requiredRoles.some((role) => user.role === role);

    if (!hasPermission) {
      throw new ForbiddenException(
        `You do not have the required role(s) (${requiredRoles.join(', ')}) to access this resource.`,
      );
    }

    return true;
  }
}
