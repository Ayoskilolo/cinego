import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { MovieService } from '../movie/movie.service';
import { Role } from 'src/auth/enums/role.enum';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly movieService: MovieService,
  ) {}

  async create(
    createCommentDto: CreateCommentDto,
    user: { sub: string; role: string },
  ): Promise<Comment> {
    const movie = await this.movieService.findOne(
      createCommentDto.movieId,
      user.sub,
    );
    if (!movie) {
      throw new NotFoundException(
        `Movie with ID "${createCommentDto.movieId}" not found`,
      );
    }

    const comment = this.commentRepository.create({
      ...createCommentDto,
      userId: user.sub,
      movieId: createCommentDto.movieId,
    });

    return await this.commentRepository.save(comment);
  }

  async findAllCommentsByMovie(
    movieId: string,
    userId: string,
  ): Promise<Comment[]> {
    const movie = await this.movieService.findOne(movieId, userId);
    if (!movie) {
      throw new NotFoundException(`Movie with ID "${movieId}" not found`);
    }
    return this.commentRepository.find({
      where: { movieId },
      relations: ['user'],
    });
  }

  async remove(id: string, user: { sub: string; role: string }): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: user.role === Role.ADMIN ? { id } : { id, userId: user.sub },
    });
    if (!comment) {
      throw new NotFoundException(
        `Comment with ID "${id}" not found or user not authorized`,
      );
    }
    await this.commentRepository.delete(id);
  }
}
