import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogComment } from './entity/blog-comment.entity';
import { CreateBlogCommentDto } from './dto/create-blog-comment.dto';
import { UpdateBlogCommentDto } from './dto/update-blog-comment.dto';
import { BlogsService } from './blogs.service';
import { Role } from 'src/auth/enums/role.enum';
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate';

@Injectable()
export class BlogCommentService {
  constructor(
    @InjectRepository(BlogComment)
    private readonly blogCommentRepository: Repository<BlogComment>,
    private readonly blogsService: BlogsService,
  ) {}

  async create(
    createBlogCommentDto: CreateBlogCommentDto,
    profileId: string,
  ): Promise<BlogComment> {
    if (
      !createBlogCommentDto.content ||
      !createBlogCommentDto.content.trim()
    ) {
      throw new BadRequestException('Comment content must be non-empty');
    }

    const blog = await this.blogsService.findOne(createBlogCommentDto.blogId);
    if (!blog) {
      throw new NotFoundException(
        `Blog with ID "${createBlogCommentDto.blogId}" not found`,
      );
    }

    const comment = this.blogCommentRepository.create({
      ...createBlogCommentDto,
      profileId: profileId,
      blogId: createBlogCommentDto.blogId,
    });

    return await this.blogCommentRepository.save(comment);
  }

  async findAllCommentsByBlog(query: PaginateQuery, blogId: string) {
    const blog = await this.blogsService.findOne(blogId);
    if (!blog) {
      throw new NotFoundException(`Blog with ID "${blogId}" not found`);
    }

    const paginateConfig: PaginateConfig<BlogComment> = {
      sortableColumns: ['dateCreated'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['content'],
      defaultLimit: 10,
      filterableColumns: {},
      select: [
        'id',
        'content',
        'blogId',
        'profileId',
        'dateCreated',
        'dateUpdated',
      ],
    };

    const queryBuilder = this.blogCommentRepository
      .createQueryBuilder('blogComment')
      .leftJoinAndSelect('blogComment.profile', 'profile')
      .where('blogComment.blogId = :blogId', { blogId });

    return await paginate(query, queryBuilder, paginateConfig);
  }

  async findOne(id: string): Promise<BlogComment> {
    const comment = await this.blogCommentRepository.findOne({
      where: { id },
      relations: ['profile', 'blog'],
    });
    if (!comment) {
      throw new NotFoundException(`Blog comment with ID "${id}" not found`);
    }
    return comment;
  }

  async update(
    id: string,
    updateBlogCommentDto: UpdateBlogCommentDto,
    profileId: string,
    user: { sub: string; role: string },
  ): Promise<BlogComment> {
    const comment = await this.blogCommentRepository.findOne({
      where:
        user.role === Role.ADMIN
          ? { id }
          : { id, profileId: profileId },
    });

    if (!comment) {
      throw new NotFoundException(
        `Blog comment with ID "${id}" not found or user not authorized`,
      );
    }

    if (updateBlogCommentDto.content) {
      if (!updateBlogCommentDto.content.trim()) {
        throw new BadRequestException('Comment content must be non-empty');
      }
      comment.content = updateBlogCommentDto.content;
    }

    return await this.blogCommentRepository.save(comment);
  }

  async remove(
    id: string,
    profileId: string,
    user: { sub: string; role: string },
  ) {
    const comment = await this.blogCommentRepository.findOne({
      where:
        user.role === Role.ADMIN
          ? { id }
          : { id, profileId: profileId },
    });

    if (!comment) {
      throw new NotFoundException(
        `Blog comment with ID "${id}" not found or user not authorized`,
      );
    }

    await this.blogCommentRepository.delete(id);
    return { message: 'Blog comment deleted successfully' };
  }

  async findAll(query: PaginateQuery) {
    const paginateConfig: PaginateConfig<BlogComment> = {
      sortableColumns: ['dateCreated'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['content'],
      defaultLimit: 10,
      filterableColumns: {
        blogId: true,
        profileId: true,
      },
      select: [
        'id',
        'content',
        'blogId',
        'profileId',
        'dateCreated',
        'dateUpdated',
      ],
    };

    const queryBuilder = this.blogCommentRepository
      .createQueryBuilder('blogComment')
      .leftJoinAndSelect('blogComment.profile', 'profile')
      .leftJoinAndSelect('blogComment.blog', 'blog');

    return await paginate(query, queryBuilder, paginateConfig);
  }
}
