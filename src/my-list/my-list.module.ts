import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MyListEntity } from './entities/my-list.entity';
import { MyListService } from './my-list.service';
import { Movie } from '../movie/entities/movie.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MyListEntity, Movie])],
  providers: [MyListService],
  exports: [MyListService],
})
export class MyListModule {}
