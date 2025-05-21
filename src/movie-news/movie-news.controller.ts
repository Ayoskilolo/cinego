import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards, // Make sure UseGuards is imported if not already
} from '@nestjs/common';
import { MovieNewsService } from './movie-news.service';
import { CreateMovieNewsDto } from './dto/create-movie-news.dto';
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Roles(Role.ADMIN) // All the routes in this controller will require ADMIN role
@Controller('movie-news')
export class MovieNewsController {
  constructor(private readonly movieNewsService: MovieNewsService) {}

  @Post()
  create(@Body() createMovieNewsDto: CreateMovieNewsDto) {
    return this.movieNewsService.create(createMovieNewsDto);
  }

  @Get()
  findAll() {
    return this.movieNewsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.movieNewsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMovieNewsDto: UpdateMovieNewsDto,
  ) {
    return this.movieNewsService.update(id, updateMovieNewsDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.movieNewsService.remove(id);
  }
}
