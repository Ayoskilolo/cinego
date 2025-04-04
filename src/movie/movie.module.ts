import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovieService } from './movie.service';
import { MovieController } from './movie.controller';
import { Movie } from './entities/movie.entity';
import { ProvidersModule } from '../providers/providers.module';
import { MyListModule } from '../my-list/my-list.module';

@Module({
  imports: [TypeOrmModule.forFeature([Movie]), ProvidersModule, MyListModule],
  controllers: [MovieController],
  providers: [MovieService],
  exports: [MovieService],
})
export class MovieModule {}
