import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  create(@Body() createCommentDto: CreateCommentDto, @Req() req: Request) {
    return this.commentService.create(createCommentDto, req['user']);
  }

  @Get('movie/:movieId')
  findAllByMovie(@Param('movieId') movieId: string, @Req() req: Request) {
    return this.commentService.findAllCommentsByMovie(
      movieId,
      req['user']?.sub,
    );
  }

  // TODO: Users can only delete their own comments.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: Request) {
    // If users can only delete their own comments, the service should handle this logic
    return this.commentService.remove(id, req['user']);
  }
}
