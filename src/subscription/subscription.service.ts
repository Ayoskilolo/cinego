import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SubscriptionType } from '../user/enum/userType';
import { Cron } from '@nestjs/schedule';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // Runs every day at 00:00 (midnight) to automatically downgrade expired premiums
  @Cron('0 0 * * *')
  async downgradeExpiredPremiums() {
    this.logger.log('Downgrading expired premiums...');
    const now = new Date();

    // Build typed conditions to avoid alias/case issues in SQL
    const where = {
      subscriptionType: SubscriptionType.PREMIUM,
      subscriptionExpiresAt: LessThan(now),
    } as const;

    // Count users to be downgraded first (for logging)
    const usersToDowngrade = await this.userRepo.count({ where });

    // Perform the update using repository API (safe column mapping)
    await this.userRepo.update(where, {
      subscriptionType: SubscriptionType.FREE_TIER,
      subscriptionExpiresAt: null,
    });

    this.logger.log(
      `Downgraded ${usersToDowngrade} expired premium subscriptions`,
    );
  }
}
