import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SimExperienceModule } from './sim-experience/sim-experience.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [AuthModule, UserModule, SubscriptionModule, SimExperienceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
