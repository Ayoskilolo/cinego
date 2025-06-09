import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { MovieModule } from '../movie/movie.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Comment]), MovieModule, AuthModule],
  providers: [CommentService],
  controllers: [CommentController],
})
export class CommentModule {}
