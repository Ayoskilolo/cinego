import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemSimilarity } from './entities/item-similarity.entity';
import { EmailCampaignJob } from './entities/email-campaign-job.entity';
import { Movie } from '../movie/entities/movie.entity';
import { Review } from '../review/entities/review.entity';
import { WatchHistory } from '../user/entities/watch-history.entity';
import { MyListEntity } from '../my-list/entities/my-list.entity';
import { Profile } from '../user/entities/profile.entity';
import { User } from '../user/entities/user.entity';
import { SessionEntity } from '../auth/entities/session.entity';
import { RecommendationController } from './recommendation.controller';
import { MyListModule } from '../my-list/my-list.module';
import { MailModule } from '../mail/mail.module';

@Module({
  providers: [RecommendationService],
  imports: [
    TypeOrmModule.forFeature([
      ItemSimilarity,
      Movie,
      Review,
      WatchHistory,
      MyListEntity,
      Profile,
      User,
      SessionEntity,
      EmailCampaignJob,
    ]),
    MyListModule,
    MailModule,
  ],
  exports: [RecommendationService],
  controllers: [RecommendationController],
})
export class RecommendationModule {}
