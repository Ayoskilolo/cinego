import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import config from './config';
import { seeder } from 'nestjs-seeder';
import { Movie } from './movie/entities/movie.entity';
import { PaymentPartner } from './payment/entities/payment-partner.entity';
import { Profile } from './user/entities/profile.entity';
import { User } from './user/entities/user.entity';
import { PaymentPartnerSeeder } from './payment/payment.method.seeder';
import { Subscription } from './subscription/entities/subscription.entity';
import { Transaction } from './transactions/entities/transaction.entity';
import { ProvidersEntity } from './providers/entities/providers.entity';
import { ProvidersSeeder } from './providers/providers.seeder';

seeder({
  imports: [
    ConfigModule.forRoot({ load: config }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        configService.get('database'),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([
      User,
      Profile,
      Subscription,
      PaymentPartner,
      Movie,
      Transaction,
      ProvidersEntity,
    ]),
  ],
}).run([PaymentPartnerSeeder, ProvidersSeeder]);
