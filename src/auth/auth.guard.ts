import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC } from './auth.decorator';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('jwt.secret'),
      });

      const user = await this.userService.findOne(payload.sub); // User object from DB

      if (!user) { // Ensure user exists
        throw new UnauthorizedException('User not found.');
      }

      let finalActiveProfileId = user.activeProfileId;
      // Add profile validation
      const profile = user.profiles.find((p) => p.id === user.activeProfileId);
      if (!profile) {
        // Profile doesn't exist anymore, try to ensure a valid profile
        const updatedUser = await this.userService.ensureActiveProfile(user.id);
        finalActiveProfileId = updatedUser.activeProfileId;
      }
      
      // Assign custom user object to the request
      request['user'] = {
        ...payload, // sub, email, etc. from JWT
        activeProfileId: finalActiveProfileId,
        role: user.role, // Add the role from the fetched user object
      };
    } catch (e) {
      // Catch specific JWT errors or rethrow a generic UnauthorizedException
      throw new UnauthorizedException(e.message || 'Invalid token or authentication failed.');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
