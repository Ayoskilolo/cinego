import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { BlogsService } from './blogs.service'
import { CreateBlogDto } from './dto/create-blog.dto'
import { UpdateBlogDto } from './dto/update-blog.dto'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Role } from '../auth/enums/role.enum'
import { Roles } from '../auth/decorators/roles.decorator'
import { Paginate, PaginateQuery } from 'nestjs-paginate'
import { StructuredResponse } from '../response/structured-response'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger'

@ApiTags('Blogs')
@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new blog (Admin only)' })
  @ApiBody({ type: CreateBlogDto })
  @ApiResponse({ status: 201, description: 'Blog created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiBearerAuth()
  create(@Body() dto: CreateBlogDto) {
    return this.blogsService.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of blogs' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by column:direction' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'filter', required: false, type: String, description: 'Filter by column:value' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blogs.' })
  async findAll(@Paginate() query: PaginateQuery) {
    const data = await this.blogsService.findAll(query)
    return new StructuredResponse({ data })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a blog by its ID' })
  @ApiParam({ name: 'id', description: 'ID of the blog', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved blog.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.findOne(id)
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a blog (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID of the blog to update', type: 'string' })
  @ApiBody({ type: UpdateBlogDto })
  @ApiResponse({ status: 200, description: 'Blog updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  @ApiBearerAuth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBlogDto) {
    return this.blogsService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blog (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID of the blog to delete', type: 'string' })
  @ApiResponse({ status: 204, description: 'Blog deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  @ApiBearerAuth()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.remove(id)
  }
}
