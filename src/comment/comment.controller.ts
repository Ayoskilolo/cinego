import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Comments')
@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new comment' })
  @ApiBody({ type: CreateCommentDto })
  @ApiResponse({ status: 201, description: 'Comment created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @Req() req: Request,
  ) {
    return await this.commentService.create(createCommentDto, req['user']);
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Get all comments for a movie' })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved comments.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  async findAllByMovie(@Param('movieId') movieId: string, @Req() req: Request) {
    return await this.commentService.findAllCommentsByMovie(
      movieId,
      req['user']?.sub,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a comment by ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the comment to delete',
    type: 'string',
  })
  @ApiResponse({ status: 200, description: 'Comment deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. User cannot delete this comment.',
  })
  @ApiResponse({ status: 404, description: 'Comment not found.' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    return await this.commentService.remove(id, req['user']);
  }
}
