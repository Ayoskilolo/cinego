import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MyListEntity } from './entities/my-list.entity';
import { MyListService } from './my-list.service';

@Module({
  imports: [TypeOrmModule.forFeature([MyListEntity])],
  providers: [MyListService],
  exports: [MyListService],
})
export class MyListModule {}
