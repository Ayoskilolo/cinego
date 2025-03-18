import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovieService } from './movie.service';
import { MovieController } from './movie.controller';
import { Movie } from './entities/movie.entity';
import { ProvidersModule } from 'src/providers/providers.module';

@Module({
  imports: [TypeOrmModule.forFeature([Movie]), ProvidersModule],
  controllers: [MovieController],
  providers: [MovieService],
})
export class MovieModule {}
