import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { MovieModule } from '../movie/movie.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Review]), MovieModule, AuthModule],
  providers: [ReviewService],
  controllers: [ReviewController],
})
export class ReviewModule {}
