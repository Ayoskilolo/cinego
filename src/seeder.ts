import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import config from './config';
import { seeder } from 'nestjs-seeder';
// Fix incorrect imports and align with actual project structure
import { User } from './user/entities/user.entity';
import { Profile } from './user/entities/profile.entity';
import { Movie } from './movie/entities/movie.entity';
import { ProvidersEntity } from './providers/entities/providers.entity';
import { PaymentPartner } from './payment/entities/payment-partner.entity';
import { SessionEntity } from './auth/entities/session.entity';
import { Transaction } from './transactions/entities/transaction.entity';
import { WatchHistory } from './user/entities/watch-history.entity';
import { MyListEntity } from './my-list/entities/my-list.entity';
import { Comment } from './comment/entities/comment.entity';
import { Review } from './review/entities/review.entity';
import { PaymentPartnerSeeder } from './payment/payment.method.seeder';
import { ProvidersSeeder } from './providers/providers.seeder';
import { MovieSeeder } from './movie/movie.seeder';
import { UserSeeder } from './user/user.seeder';
import { SessionSeeder } from './auth/session.seeder';
import { UserInteractionsSeeder } from './user/user-interactions.seeder';
import { TransactionsSeeder } from './transactions/transactions.seeder';

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
      PaymentPartner,
      Movie,
      Transaction,
      ProvidersEntity,
      SessionEntity,
      WatchHistory,
      MyListEntity,
      Comment,
      Review,
    ]),
  ],
}).run([
  PaymentPartnerSeeder,
  ProvidersSeeder,
  MovieSeeder,
  UserSeeder,
  SessionSeeder,
  TransactionsSeeder,
  UserInteractionsSeeder,
]);
