import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { MovieNewsService } from './movie-news.service'
import { Paginate, PaginateQuery } from 'nestjs-paginate'
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger'

@ApiTags('Movie News')
@Controller('movie-news')
export class MovieNewsController {
  constructor(private readonly service: MovieNewsService) {}

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of movie news' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by column:direction' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'filter', required: false, type: String, description: 'Filter by column:value (supports movieId)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved movie news.' })
  async findAll(@Paginate() query: PaginateQuery) {
    const data = await this.service.findAll(query)
    return { data }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a movie news item by its ID' })
  @ApiParam({ name: 'id', description: 'ID of the movie news item', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved movie news.' })
  @ApiResponse({ status: 404, description: 'Movie news not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }
}