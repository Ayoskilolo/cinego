import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateMovieNewsDto } from './dto/create-movie-news.dto'
import { UpdateMovieNewsDto } from './dto/update-movie-news.dto'
import { MovieNews } from './entity/movie-news.entity'
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate'

@Injectable()
export class MovieNewsService {
  constructor(
    @InjectRepository(MovieNews)
    private readonly repo: Repository<MovieNews>,
  ) {}

  async create(dto: CreateMovieNewsDto): Promise<MovieNews> {
    const entity = this.repo.create(dto)
    return this.repo.save(entity)
  }

  async findAll(query: PaginateQuery) {
    const config: PaginateConfig<MovieNews> = {
      sortableColumns: ['createdAt', 'title'],
      defaultSortBy: [['createdAt', 'DESC']],
      searchableColumns: ['title', 'content', 'author', 'description'],
      defaultLimit: 10,
      filterableColumns: {
        author: true,
        movieId: true,
      },
      select: ['id', 'title', 'content', 'author', 'description', 'movieId', 'createdAt', 'updatedAt'],
    }
    return paginate(query, this.repo, config)
  }

  async findOne(id: string): Promise<MovieNews> {
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity) throw new NotFoundException(`MovieNews with ID "${id}" not found`)
    return entity
  }

  async update(id: string, dto: UpdateMovieNewsDto): Promise<MovieNews> {
    const entity = await this.repo.preload({ id, ...dto })
    if (!entity) throw new NotFoundException(`MovieNews with ID "${id}" not found`)
    return this.repo.save(entity)
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id)
    if (result.affected === 0) throw new NotFoundException(`MovieNews with ID "${id}" not found`)
  }
}