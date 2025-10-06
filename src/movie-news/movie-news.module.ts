import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovieNews } from './entity/movie-news.entity';
import { MovieNewsService } from './movie-news.service';
import { MovieNewsController } from './movie-news.controller';
import { AdminMovieNewsController } from './admin-movie-news.controller';
import { Movie } from '../movie/entities/movie.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovieNews, Movie])],
  providers: [MovieNewsService],
  controllers: [MovieNewsController, AdminMovieNewsController],
})
export class MovieNewsModule {}
