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
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MovieNewsService } from './movie-news.service';
import { CreateMovieNewsDto } from './dto/create-movie-news.dto';
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Movie News')
@Controller('movie-news')
export class MovieNewsController {
  constructor(private readonly movieNewsService: MovieNewsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new movie news article (Admin only)' })
  @ApiBody({ type: CreateMovieNewsDto })
  @ApiResponse({
    status: 201,
    description: 'Movie news article created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiBearerAuth()
  create(@Body() createMovieNewsDto: CreateMovieNewsDto) {
    return this.movieNewsService.create(createMovieNewsDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of movie news articles' })
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
    description: 'Sort by column:direction',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description: 'Filter by column:value',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved movie news articles.',
  })
  async findAll(@Paginate() query: PaginateQuery) {
    const data = await this.movieNewsService.findAll(query);
    return { data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a movie news article by its ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the movie news article',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved movie news article.',
  })
  @ApiResponse({ status: 404, description: 'Movie news article not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.movieNewsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a movie news article (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'ID of the movie news article to update',
    type: 'string',
  })
  @ApiBody({ type: UpdateMovieNewsDto })
  @ApiResponse({
    status: 200,
    description: 'Movie news article updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Movie news article not found.' })
  @ApiBearerAuth()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMovieNewsDto: UpdateMovieNewsDto,
  ) {
    return this.movieNewsService.update(id, updateMovieNewsDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a movie news article (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'ID of the movie news article to delete',
    type: 'string',
  })
  @ApiResponse({
    status: 204,
    description: 'Movie news article deleted successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Movie news article not found.' })
  @ApiBearerAuth()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.movieNewsService.remove(id);
  }
}
