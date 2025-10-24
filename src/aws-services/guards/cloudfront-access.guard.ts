import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../../movie/entities/movie.entity';
import { User } from '../../user/entities/user.entity';
import { SubscriptionType } from '../../user/enum/userType';

@Injectable()
export class CloudfrontAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepo: Repository<Movie>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const jwtUser = req['user'];

    if (!jwtUser?.sub) {
      throw new ForbiddenException('User context missing.');
    }

    const movieId: string | undefined = req.body?.movieId;
    if (!movieId) {
      throw new BadRequestException('movieId is required in request body');
    }

    const movie = await this.movieRepo.findOne({ where: { id: movieId } });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    const useTrailer: boolean = !!req.body?.useTrailer;
    if (useTrailer) {
      if (!movie.mediaKeys?.trailer) {
        throw new ForbiddenException('Trailer media is unavailable for streaming');
      }
    } else {
      if (!movie.mediaKeys?.main) {
        throw new ForbiddenException('Movie media is unavailable for streaming');
      }
    }

    // Fetch user subscription info
    const user = await this.userRepo.findOne({
      select: ['id', 'subscriptionType', 'subscriptionExpiresAt'],
      where: { id: jwtUser.sub },
    });
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Determine effective subscription type (premium can be expired)
    const now = new Date();
    let effectiveType: SubscriptionType;
    if (
      user.subscriptionType === SubscriptionType.PREMIUM &&
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt > now
    ) {
      effectiveType = SubscriptionType.PREMIUM;
    } else if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      effectiveType = SubscriptionType.FREEMIUM;
    } else {
      effectiveType = SubscriptionType.FREE_TIER;
    }

    // Access rules:
    // - Non-premium movies: allow
    // - Premium movies: allow trailer to all; main only for active PREMIUM
    if (movie.isPremium) {
      const isPremiumUser = effectiveType === SubscriptionType.PREMIUM;
      const useTrailer: boolean = !!req.body?.useTrailer;
      if (!useTrailer && !isPremiumUser) {
        throw new ForbiddenException(
          'You do not have permission to access this premium content.',
        );
      }
    }

    // Attach movie to request for controller to use mediaKeys
    req['movie'] = movie;
    return true;
  }
}