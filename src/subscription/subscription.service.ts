import { Injectable } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UserService } from 'src/user/user.service';
import { Subscription } from './entities/subscription.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private readonly userService: UserService,
  ) {}

  async createSubscription(
    userID: string,
    createSubscriptionDto: CreateSubscriptionDto,
  ) {
    const user = this.userService.findOneById(userID);

    const newSubscription = this.subscriptionRepository.create(
      createSubscriptionDto,
    );

    return await this.subscriptionRepository.save(newSubscription);
  }

  placeUserOnPremiumPlan(userId: string) {
    return `This action returns all subscription`;
  }

  findOne(id: number) {
    return `This action returns a #${id} subscription`;
  }

  update(id: number, updateSubscriptionDto: UpdateSubscriptionDto) {
    return `This action updates a #${id} subscription`;
  }

  remove(id: number) {
    return `This action removes a #${id} subscription`;
  }
}
