import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovieNewsDto } from './dto/create-movie-news.dto';
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto';
import { MovieNews } from './entity/movie-news.entity';
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate';

@Injectable()
export class MovieNewsService {
  constructor(
    @InjectRepository(MovieNews)
    private readonly movieNewsRepository: Repository<MovieNews>,
  ) {}

  private readonly logger = new Logger(MovieNewsService.name);

  async create(createMovieNewsDto: CreateMovieNewsDto): Promise<MovieNews> {
    const newsItem = this.movieNewsRepository.create(createMovieNewsDto);
    return this.movieNewsRepository.save(newsItem);
  }

  async findAll(query: PaginateQuery) {
    const paginateConfig: PaginateConfig<MovieNews> = {
      sortableColumns: ['createdAt', 'title'],
      defaultSortBy: [['createdAt', 'DESC']],
      searchableColumns: ['title', 'content', 'author', 'description'],
      defaultLimit: 10,
      filterableColumns: {
        author: true,
      },
      select: [
        'id',
        'title',
        'content',
        'author',
        'description',
        'createdAt',
        'updatedAt',
      ],
    };

    return await paginate(query, this.movieNewsRepository, paginateConfig);
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
