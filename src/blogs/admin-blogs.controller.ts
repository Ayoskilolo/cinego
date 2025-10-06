import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Role } from '../auth/enums/role.enum'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger'
import { BlogsService } from './blogs.service'
import { Paginate, PaginateQuery } from 'nestjs-paginate'
import { CreateBlogDto } from './dto/create-blog.dto'
import { UpdateBlogDto } from './dto/update-blog.dto'

@ApiTags('Admin Blogs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/blogs')
export class AdminBlogsController {
  constructor(private readonly blogsService: BlogsService) {}

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
    return { data: { items: result.data, meta: result.meta, links: result.links } }
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
    return { data: blog }
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
}