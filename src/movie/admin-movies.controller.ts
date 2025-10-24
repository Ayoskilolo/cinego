import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { MovieService } from './movie.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

class AdminUpdateMovieDto {
  title?: string;
  synopsis?: string;
  productionYear?: string;
  marketRating?: string;
  isHD?: boolean;
  director?: string;
  cast?: string[];
  genres?: string[];
  languages?: string[];
  duration?: string;
  isPremium?: boolean;
  images?: { poster: string; posterLandscape: string; thumbnail: string };
  mediaKeys?: { main: string; trailer?: string };
  programType?: string;
  providerId?: string;
  providerTitleId?: string;
}

@ApiTags('Admin Movies')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/movies')
export class AdminMoviesController {
  constructor(private readonly movieService: MovieService) {}

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of movies (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'filter', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Successfully retrieved movies.' })
  async list(@Paginate() query: PaginateQuery) {
    const result = await this.movieService.adminFindAllPaginated(query);
    return { data: { items: result.data, meta: result.meta, links: result.links } };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a movie by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Movie ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved movie.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  async getById(@Param('id') id: string) {
    const data = await this.movieService.adminFindOne(id);
    return { data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a movie (Admin only)' })
  @ApiParam({ name: 'id', description: 'Movie ID', type: 'string' })
  @ApiBody({ type: AdminUpdateMovieDto })
  @ApiResponse({ status: 200, description: 'Movie updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  async update(@Param('id') id: string, @Body() dto: AdminUpdateMovieDto) {
    const data = await this.movieService.adminUpdate(id, dto);
    return { message: 'Movie updated successfully', data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a movie (Admin only)' })
  @ApiParam({ name: 'id', description: 'Movie ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Movie deleted successfully.' })
  async remove(@Param('id') id: string) {
    await this.movieService.adminDelete(id);
  }
}