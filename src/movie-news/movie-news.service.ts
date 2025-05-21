import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovieNewsDto } from './dto/create-movie-news.dto';
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto';
import { MovieNews } from './entity/movie-news.entity';

@Injectable()
export class MovieNewsService {
  constructor(
    @InjectRepository(MovieNews)
    private readonly movieNewsRepository: Repository<MovieNews>,
  ) {}

  async create(createMovieNewsDto: CreateMovieNewsDto): Promise<MovieNews> {
    const newsItem = this.movieNewsRepository.create(createMovieNewsDto);
    return this.movieNewsRepository.save(newsItem);
  }

  async findAll(): Promise<MovieNews[]> {
    return this.movieNewsRepository.find();
  }

  async findOne(id: string): Promise<MovieNews> {
    const newsItem = await this.movieNewsRepository.findOne({ where: { id } });
    if (!newsItem) {
      throw new NotFoundException(`Movie news with ID "${id}" not found`);
    }
    return newsItem;
  }

  async update(
    id: string,
    updateMovieNewsDto: UpdateMovieNewsDto,
  ): Promise<MovieNews> {
    const newsItem = await this.movieNewsRepository.preload({
      id: id,
      ...updateMovieNewsDto,
    });
    if (!newsItem) {
      throw new NotFoundException(`Movie news with ID "${id}" not found`);
    }
    return this.movieNewsRepository.save(newsItem);
  }

  async remove(id: string): Promise<void> {
    const result = await this.movieNewsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Movie news with ID "${id}" not found`);
    }
  }
}
