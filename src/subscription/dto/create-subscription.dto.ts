import { IsBoolean, IsEnum, IsString } from 'class-validator';
import { SubscriptionType } from '../../user/enum/userType';

export class CreateSubscriptionDto {
  @IsEnum(SubscriptionType)
  subscriptionType: SubscriptionType;

  @IsString()
  cardToken: string;

  @IsBoolean()
  freeTrial: boolean;
}
