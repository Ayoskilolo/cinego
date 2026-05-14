import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Delete,
  Patch,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { BlogCommentService } from './blog-comment.service';
import { CreateBlogCommentDto } from './dto/create-blog-comment.dto';
import { UpdateBlogCommentDto } from './dto/update-blog-comment.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Blog Comments')
@ApiBearerAuth()
@Controller('blog-comments')
export class BlogCommentController {
  constructor(private readonly blogCommentService: BlogCommentService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new blog comment' })
  @ApiBody({ type: CreateBlogCommentDto })
  @ApiResponse({ status: 201, description: 'Blog comment created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  async create(
    @Body() createBlogCommentDto: CreateBlogCommentDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return await this.blogCommentService.create(
      createBlogCommentDto,
      user.profileId,
    );
  }

  @Get('blog/:blogId')
  @ApiOperation({ summary: 'Get paginated comments for a blog post' })
  @ApiParam({ name: 'blogId', description: 'ID of the blog post', type: 'string' })
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
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog comments.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  async findAllByBlog(
    @Param('blogId', ParseUUIDPipe) blogId: string,
    @Paginate() query: PaginateQuery,
  ) {
    return await this.blogCommentService.findAllCommentsByBlog(query, blogId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a blog comment by ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the blog comment',
    type: 'string',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog comment.' })
  @ApiResponse({ status: 404, description: 'Blog comment not found.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.blogCommentService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a blog comment by ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the blog comment to update',
    type: 'string',
  })
  @ApiBody({ type: UpdateBlogCommentDto })
  @ApiResponse({ status: 200, description: 'Blog comment updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Profile cannot update this comment.',
  })
  @ApiResponse({ status: 404, description: 'Blog comment not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBlogCommentDto: UpdateBlogCommentDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return await this.blogCommentService.update(
      id,
      updateBlogCommentDto,
      user.profileId,
      req['user'],
    );
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a blog comment by ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the blog comment to delete',
    type: 'string',
  })
  @ApiResponse({ status: 200, description: 'Blog comment deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Profile cannot delete this comment.',
  })
  @ApiResponse({ status: 404, description: 'Blog comment not found.' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = req['user'];
    return await this.blogCommentService.remove(id, user.profileId, req['user']);
  }
}
