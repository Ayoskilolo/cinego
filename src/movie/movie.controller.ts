import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { MovieService } from './movie.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
// import { UpdateMovieDto } from './dto/update-movie.dto';

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
}
