import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
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
    const user = req['user'];
    return await this.commentService.create(
      createCommentDto,
      user.activeProfileId,
      req['user'],
    );
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Get paginated comments for a movie' })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Sort by column:direction (e.g., dateCreated:DESC)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search in comment content',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved comments.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  async findAllByMovie(
    @Param('movieId') movieId: string,
    @Req() req: Request,
    @Paginate() query: PaginateQuery,
  ) {
    const user = req['user'];
    return await this.commentService.findAllCommentsByMovie(
      query,
      movieId,
      user.sub,
      user.activeProfileId,
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
    description: 'Forbidden. Profile cannot delete this comment.',
  })
  @ApiResponse({ status: 404, description: 'Comment not found.' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return await this.commentService.remove(
      id,
      user.activeProfileId,
      req['user'],
    );
  }
}
