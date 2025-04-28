import { Injectable, Logger } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
// import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UserService } from 'src/user/user.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    // Find users to be downgraded first
    const usersToDowngrade = await this.userRepo
      .createQueryBuilder()
      .where('subscriptionType = :premium AND subscriptionExpiresAt < :now', {
        premium: SubscriptionType.PREMIUM,
        now,
      })
      .getCount();

    // Perform the update
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({
        subscriptionType: SubscriptionType.FREE_TIER,
        subscriptionExpiresAt: null,
      })
      .where('subscriptionType = :premium AND subscriptionExpiresAt < :now', {
        premium: SubscriptionType.PREMIUM,
        now,
      })
      .execute();

    this.logger.log(
      `Downgraded ${usersToDowngrade} expired premium subscriptions`,
    );
  }
}
