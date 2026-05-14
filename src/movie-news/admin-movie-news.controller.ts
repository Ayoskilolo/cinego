import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { MovieNewsService } from './movie-news.service'
import { CreateMovieNewsDto } from './dto/create-movie-news.dto'
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Role } from '../auth/enums/role.enum'
import { Roles } from '../auth/decorators/roles.decorator'
import { Paginate, PaginateQuery } from 'nestjs-paginate'
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'

@ApiTags('Admin Movie News')
@Controller('admin/movie-news')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminMovieNewsController {
  constructor(private readonly service: MovieNewsService) {}

  @Get()
  @ApiOperation({ summary: 'List movie news (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'filter', required: false, type: String, description: 'Filter by column:value (supports movieId)' })
  @ApiResponse({ status: 200, description: 'Paginated list of movie news.' })
  async list(@Paginate() query: PaginateQuery) {
    const data = await this.service.findAll(query)
    return { data }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a movie news item by ID (Admin)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Movie news item retrieved.' })
  @ApiResponse({ status: 404, description: 'Movie news item not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a movie news item (Admin)' })
  @ApiBody({ type: CreateMovieNewsDto })
  @ApiResponse({ status: 201, description: 'Movie news item created.' })
  create(@Body() dto: CreateMovieNewsDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a movie news item (Admin)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateMovieNewsDto })
  @ApiResponse({ status: 200, description: 'Movie news item updated.' })
  @ApiResponse({ status: 404, description: 'Movie news item not found.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMovieNewsDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a movie news item (Admin)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 204, description: 'Movie news item deleted.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}