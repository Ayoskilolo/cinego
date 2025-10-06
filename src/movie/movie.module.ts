import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from './entities/movie.entity';
import { MovieService } from './movie.service';
import { MovieController } from './movie.controller';
import { ProvidersModule } from 'src/providers/providers.module';
import { MyListModule } from 'src/my-list/my-list.module';
import { UserModule } from 'src/user/user.module';
import { AwsServicesModule } from 'src/aws-services/aws-services.module';
import { AdminMoviesController } from './admin-movies.controller';
import { MovieNews } from 'src/movie-news/entity/movie-news.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movie, MovieNews]),
    ProvidersModule,
    MyListModule,
    UserModule,
    AwsServicesModule,
  ],
  controllers: [MovieController, AdminMoviesController],
  providers: [MovieService],
  exports: [MovieService],
})
export class MovieModule {}
