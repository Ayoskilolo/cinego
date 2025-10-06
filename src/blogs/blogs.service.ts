import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateBlogDto } from './dto/create-blog.dto'
import { UpdateBlogDto } from './dto/update-blog.dto'
import { Blog } from './entity/blog.entity'
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate'

@Injectable()
export class BlogsService {
  constructor(
    @InjectRepository(Blog)
    private readonly blogsRepository: Repository<Blog>,
  ) {}

  private readonly logger = new Logger(BlogsService.name)

  async create(dto: CreateBlogDto): Promise<Blog> {
    const entity = this.blogsRepository.create(dto)
    return this.blogsRepository.save(entity)
  }

  async findAll(query: PaginateQuery) {
    const paginateConfig: PaginateConfig<Blog> = {
      sortableColumns: ['createdAt', 'title'],
      defaultSortBy: [['createdAt', 'DESC']],
      searchableColumns: ['title', 'content', 'author', 'description'],
      defaultLimit: 10,
      filterableColumns: {
        author: true,
      },
      select: ['id', 'title', 'content', 'author', 'description', 'createdAt', 'updatedAt'],
    }

    return await paginate(query, this.blogsRepository, paginateConfig)
  }

  async findOne(id: string): Promise<Blog> {
    const entity = await this.blogsRepository.findOne({ where: { id } })
    if (!entity) {
      throw new NotFoundException(`Blog with ID "${id}" not found`)
    }
    return entity
  }

  async update(id: string, dto: UpdateBlogDto): Promise<Blog> {
    const entity = await this.blogsRepository.preload({ id, ...dto })
    if (!entity) {
      throw new NotFoundException(`Blog with ID "${id}" not found`)
    }
    return this.blogsRepository.save(entity)
  }

  async remove(id: string): Promise<void> {
    const result = await this.blogsRepository.delete(id)
    if (result.affected === 0) {
      throw new NotFoundException(`Blog with ID "${id}" not found`)
    }
  }
}
