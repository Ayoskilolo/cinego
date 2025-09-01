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
import { IS_PRE_PROFILE, IS_PUBLIC } from './auth.decorator';
import { UserService } from '../user/user.service';
import { SessionEntity } from './entities/session.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { SessionType } from './entities/session.enum';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly userService: UserService,
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isPreProfile = this.reflector.getAllAndOverride<boolean>(
      IS_PRE_PROFILE,
      [context.getHandler(), context.getClass()],
    );

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

      if (!user) {
        // Ensure user exists
        throw new UnauthorizedException('User not found.');
      }

      const sessionId = payload.sessionId;
      if (!sessionId) {
        throw new UnauthorizedException(
          'Invalid token. Missing session ID in token.',
        );
      }

      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session || !session.isActive) {
        throw new UnauthorizedException(
          'Invalid token. Session not found or expired.',
        );
      }

      if (session.expiresAt && new Date() > session.expiresAt) {
        throw new UnauthorizedException(
          'Session expired. Please sign in again.',
        );
      }

      if (isPreProfile && session.sessionType === SessionType.PRE_PROFILE) {
        request['user'] = { ...payload };
        console.log('PRE PROFILE WORKING');
        return true;
      }

      // If you want to access an endpoint that requires a profile but the token is a pre-profile token
      if (session.sessionType === SessionType.PRE_PROFILE) {
        throw new UnauthorizedException(
          'Invalid token. Session not found or expired.',
        );
      }

      let currentProfileId = payload.profileId;
      // Add profile validation
      const profile = user.profiles.find((p) => p.id === currentProfileId);
      if (!profile) {
        // Profile doesn't exist anymore, ask user to login again
        throw new UnauthorizedException(
          'Profile not found. Please login again to continue.',
        );
      }

      // Check if the profile is the same as the one in the session
      if (payload.profileId !== session.currentProfileId) {
        throw new UnauthorizedException(
          'Invalid profile context. Please switch or re-authenticate.',
        );
      }

      // Assign custom user object to the request
      request['user'] = {
        ...payload, // sub, email, etc. from JWT
        role: user.role, // Add the role from the fetched user object
      };
    } catch (e) {
      // Catch specific JWT errors or rethrow a generic UnauthorizedException
      if (e?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired. Please sign in again.');
      }
      throw new UnauthorizedException(e.message || 'Invalid token.');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
