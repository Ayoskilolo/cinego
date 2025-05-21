import {
  Controller,
  Get,
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

@Controller('movie')
export class MovieController {
  constructor(private readonly movieService: MovieService) {}

  @Get()
  async getMovies(@Paginate() query: PaginateQuery, @Req() req: Request) {
    const data = await this.movieService.getMovies(query, req['user']?.sub);
    return { data };
  }

  @Get('genres')
  async findAllGenres() {
    return await this.movieService.findAllGenres();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.movieService.findOne(id, req['user']?.sub);
  }

  @Get('/genres/:genre')
  findMoviesByGenre(@Param('genre') genre: string, @Req() req: Request) {
    return this.movieService.findByGenre(genre, req['user']?.sub);
  }

  @Patch(':id/set-premium')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async setPremiumStatus(
    @Param('id') movieId: string,
    @Body('isPremium') isPremium: boolean,
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
}
import { UpdateMovieDto } from './dto/update-movie.dto';
