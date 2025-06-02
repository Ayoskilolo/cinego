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
} from '@nestjs/common';
import { MovieNewsService } from './movie-news.service';
import { CreateMovieNewsDto } from './dto/create-movie-news.dto';
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('movie-news')
export class MovieNewsController {
  constructor(private readonly movieNewsService: MovieNewsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() createMovieNewsDto: CreateMovieNewsDto) {
    return this.movieNewsService.create(createMovieNewsDto);
  }

  @Get()
  async findAll(@Paginate() query: PaginateQuery) {
    const data = await this.movieNewsService.findAll(query);
    return { data };
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.movieNewsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMovieNewsDto: UpdateMovieNewsDto,
  ) {
    return this.movieNewsService.update(id, updateMovieNewsDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.movieNewsService.remove(id);
  }
}
