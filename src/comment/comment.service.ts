import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { MovieService } from '../movie/movie.service';
import { Role } from 'src/auth/enums/role.enum';
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly movieService: MovieService,
  ) {}

  async create(
    createCommentDto: CreateCommentDto,
    profileId: string,
    user: { sub: string; role: string },
  ): Promise<Comment> {
    const movie = await this.movieService.findOne(
      createCommentDto.movieId,
      user.sub,
      profileId,
    );
    if (!movie) {
      throw new NotFoundException(
        `Movie with ID "${createCommentDto.movieId}" not found`,
      );
    }

    const comment = this.commentRepository.create({
      ...createCommentDto,
      profileId: profileId,
      movieId: createCommentDto.movieId,
    });

    return await this.commentRepository.save(comment);
  }

  async findAllCommentsByMovie(
    query: PaginateQuery,
    movieId: string,
    userId: string,
    profileId: string,
  ) {
    const movie = await this.movieService.findOne(movieId, userId, profileId);
    if (!movie) {
      throw new NotFoundException(`Movie with ID "${movieId}" not found`);
    }

    const paginateConfig: PaginateConfig<Comment> = {
      sortableColumns: ['dateCreated'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['content'],
      defaultLimit: 10,
      filterableColumns: {},
      select: [
        'id',
        'content',
        'movieId',
        'profileId',
        'dateCreated',
        'dateUpdated',
      ],
    };

    const queryBuilder = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.profile', 'profile')
      .where('comment.movieId = :movieId', { movieId });

    return await paginate(query, queryBuilder, paginateConfig);
  }

  async remove(
    id: string,
    profileId: string,
    user: { sub: string; role: string },
  ) {
    const comment = await this.commentRepository.findOne({
      where: user.role === Role.ADMIN ? { id } : { id, profileId: profileId },
    });
    if (!comment) {
      throw new NotFoundException(
        `Comment with ID "${id}" not found or user not authorized`,
      );
    }
    await this.commentRepository.delete(id);
    return { message: 'Comment deleted successfully' };
  }
}
