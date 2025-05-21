import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { PLANS_KEY, Plan } from '../plans/plans.decorator';
import { SubscriptionType } from '../../user/enum/userType';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const jwtUser = req['user'];

    // get user from db
    const { subscriptionType, subscriptionExpiresAt } =
      await this.userRepo.findOneOrFail({
        select: ['subscriptionType', 'subscriptionExpiresAt'],
        where: { id: jwtUser.sub },
      });

    // 2) auto-downgrade “logically” (just for this request, the cron job will handle it in the db at midnight) if expired
    const now = new Date();
    let effectiveType: SubscriptionType;

    if (
      subscriptionType === SubscriptionType.PREMIUM &&
      subscriptionExpiresAt &&
      subscriptionExpiresAt > now
    ) {
      effectiveType = SubscriptionType.PREMIUM;
    } else if (subscriptionType === SubscriptionType.FREEMIUM) {
      effectiveType = SubscriptionType.FREEMIUM;
    } else {
      effectiveType = SubscriptionType.FREE_TIER;
    }
    // 3) enforce @Roles
    const requiredPlans = this.reflector.get<Plan[]>(
      PLANS_KEY,
      ctx.getHandler(),
    );

    if (!requiredPlans) return true; // no decorator → open to all

    if (!requiredPlans.includes(effectiveType)) {
      throw new ForbiddenException(
        `Your "${effectiveType}" plan cannot access this.`,
      );
    }
    return true;
  }
}
