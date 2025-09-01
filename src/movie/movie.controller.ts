import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MovieService } from './movie.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { Role } from 'src/auth/enums/role.enum';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  FetchFromProvidersResponseDto,
  FetchFromSpecificProviderResponseDto,
} from './dto/fetch-providers.dto';

@ApiTags('Movies')
@Controller('movie')
export class MovieController {
  constructor(private readonly movieService: MovieService) {}

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of movies' })
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
    description: 'Sort by column:direction (e.g., title:ASC)',
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
    description: 'Filter by column:value (e.g., genre:$eq:Action)',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved movies.' })
  @ApiBearerAuth()
  async getMovies(@Paginate() query: PaginateQuery, @Req() req: Request) {
    const user = req['user'];
    const data = await this.movieService.getMovies(
      query,
      user?.sub,
      user?.profileId,
    );
    return { data };
  }

  @Get('genres')
  @ApiOperation({ summary: 'Get all available movie genres' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved genres.' })
  async findAllGenres() {
    return await this.movieService.findAllGenres();
  }

  @Get('fetch-from-providers')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch movies from all active providers (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully fetched movies from providers.',
    type: FetchFromProvidersResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  @ApiBearerAuth()
  async fetchFromAllProviders() {
    const result = await this.movieService.fetchAndSaveMoviesFromProviders();
    return {
      message: result.message,
      data: {
        newMovies: result.newMovies,
        skippedDuplicates: result.skippedDuplicates,
      },
    };
  }

  @Get('/genres/:genre')
  @ApiOperation({ summary: 'Get movies by genre' })
  @ApiParam({
    name: 'genre',
    description: 'Genre to filter movies by',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved movies for the genre.',
  })
  @ApiBearerAuth()
  findMoviesByGenre(@Param('genre') genre: string, @Req() req: Request) {
    const user = req['user'];
    return this.movieService.findByGenre(genre, user?.sub, user?.profileId);
  }

  @Patch(':id/set-premium')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set the premium status of a movie (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'ID of the movie to update',
    type: 'string',
  })
  @ApiBody({
    description:
      'Specify if the movie is premium. Note: DTO for this endpoint is not fully defined yet.',
    schema: {
      type: 'object',
      properties: { isPremium: { type: 'boolean', example: true } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Movie premium status updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  @ApiBearerAuth()
  async setPremiumStatus(
    @Param('id') movieId: string,
    @Body('isPremium') isPremium: boolean, // Direct body access, consider creating a DTO
  ) {
    const updatedMovie = await this.movieService.setMoviePremiumStatus(
      movieId,
      isPremium,
    );
    return {
      message: 'Movie premium status updated successfully.',
      data: updatedMovie,
    };
  }

  @Post('fetch-from-provider/:providerId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch movies from a specific provider (Admin only)',
  })
  @ApiParam({
    name: 'providerId',
    description: 'ID of the provider to fetch movies from',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully fetched movies from the provider.',
    type: FetchFromSpecificProviderResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Provider not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  @ApiBearerAuth()
  async fetchFromSpecificProvider(@Param('providerId') providerId: string) {
    const result =
      await this.movieService.fetchMoviesFromSpecificProvider(providerId);
    return {
      message: result.message,
      data: {
        provider: result.provider,
        newMovies: result.newMovies,
        skippedDuplicates: result.skippedDuplicates,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a movie by its ID' })
  @ApiParam({ name: 'id', description: 'ID of the movie', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved movie.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  @ApiBearerAuth()
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.movieService.findOne(id, user?.sub, user?.profileId);
  }
}
