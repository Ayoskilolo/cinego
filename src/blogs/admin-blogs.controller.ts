import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus, Req } from '@nestjs/common'
import { Request } from 'express'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Role } from '../auth/enums/role.enum'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger'
import { BlogsService } from './blogs.service'
import { BlogCommentService } from './blog-comment.service'
import { Paginate, PaginateQuery } from 'nestjs-paginate'
import { CreateBlogDto } from './dto/create-blog.dto'
import { UpdateBlogDto } from './dto/update-blog.dto'
import { UpdateBlogCommentDto } from './dto/update-blog-comment.dto'
import { StructuredResponse } from '../response/structured-response'

@ApiTags('Admin Blogs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/blogs')
export class AdminBlogsController {
  constructor(
    private readonly blogsService: BlogsService,
    private readonly blogCommentService: BlogCommentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of blogs (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by column:direction (e.g., createdAt:DESC)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term for relevant fields' })
  @ApiQuery({ name: 'filter', required: false, type: String, description: 'Filter by column:value (e.g., author:$eq:Jane Doe)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blogs.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Paginate() query: PaginateQuery) {
    const result = await this.blogsService.findAll(query)
    return new StructuredResponse({ data: { items: result.data, meta: result.meta, links: result.links } })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a blog item by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Blog ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const blog = await this.blogsService.findOne(id)
    return new StructuredResponse({ data: blog })
  }

  @Post()
  @ApiOperation({ summary: 'Create a new blog (Admin only)' })
  @ApiBody({ type: CreateBlogDto })
  @ApiResponse({ status: 201, description: 'Blog created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  create(@Body() dto: CreateBlogDto) {
    return this.blogsService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a blog (Admin only)' })
  @ApiParam({ name: 'id', description: 'Blog ID', type: 'string' })
  @ApiBody({ type: UpdateBlogDto })
  @ApiResponse({ status: 200, description: 'Blog updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBlogDto) {
    return this.blogsService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blog (Admin only)' })
  @ApiParam({ name: 'id', description: 'Blog ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Blog deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.remove(id)
  }

  // Blog Comments Management

  @Get('comments')
  @ApiOperation({ summary: 'Get a paginated list of all blog comments (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by column:direction (e.g., dateCreated:DESC)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term for comment content' })
  @ApiQuery({ name: 'filter', required: false, type: String, description: 'Filter by column:value (e.g., blogId:$eq:uuid or profileId:$eq:uuid)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog comments.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listComments(@Paginate() query: PaginateQuery) {
    const result = await this.blogCommentService.findAll(query)
    return new StructuredResponse({ data: { items: result.data, meta: result.meta, links: result.links } })
  }

  @Get('comments/:id')
  @ApiOperation({ summary: 'Get a blog comment by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Blog Comment ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog comment.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog comment not found.' })
  async getCommentById(@Param('id', ParseUUIDPipe) id: string) {
    const comment = await this.blogCommentService.findOne(id)
    return new StructuredResponse({ data: comment })
  }

  @Get(':blogId/comments')
  @ApiOperation({ summary: 'Get paginated comments for a specific blog (Admin only)' })
  @ApiParam({ name: 'blogId', description: 'Blog ID', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by column:direction' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in comment content' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog comments.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  async getBlogComments(
    @Param('blogId', ParseUUIDPipe) blogId: string,
    @Paginate() query: PaginateQuery,
  ) {
    const result = await this.blogCommentService.findAllCommentsByBlog(query, blogId)
    return new StructuredResponse({ data: { items: result.data, meta: result.meta, links: result.links } })
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Update a blog comment (Admin only)' })
  @ApiParam({ name: 'id', description: 'Blog Comment ID', type: 'string' })
  @ApiBody({ type: UpdateBlogCommentDto })
  @ApiResponse({ status: 200, description: 'Blog comment updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog comment not found.' })
  async updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogCommentDto,
    @Req() req: Request,
  ) {
    const user = req['user']
    return await this.blogCommentService.update(id, dto, user.profileId, user)
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blog comment (Admin only)' })
  @ApiParam({ name: 'id', description: 'Blog Comment ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Blog comment deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog comment not found.' })
  async removeComment(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = req['user']
    return await this.blogCommentService.remove(id, user.profileId, user)
  }
}