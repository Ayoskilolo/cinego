import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovieNewsService } from './movie-news.service';
import { MovieNewsController } from './movie-news.controller';
import { MovieNews } from './entity/movie-news.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovieNews])],
  providers: [MovieNewsService],
  controllers: [MovieNewsController],
})
export class MovieNewsModule {}
