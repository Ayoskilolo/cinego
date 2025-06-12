import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { MovieService } from '../movie/movie.service';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    private readonly movieService: MovieService,
  ) {}

  async upsert(
    createReviewDto: CreateReviewDto,
    user: { sub: string; role: string },
  ): Promise<Review> {
    if (createReviewDto.rating < 1 || createReviewDto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const movieResponse = await this.movieService.findOne(
      createReviewDto.movieId,
      user.sub,
    );

    const movie = movieResponse.data;

    if (!movie || !movie.id) {
      throw new NotFoundException(
        `Movie with ID "${createReviewDto.movieId}" not found or invalid movie data returned`,
      );
    }

    let review = await this.reviewRepository.findOne({
      where: { userId: user.sub, movieId: movie.id },
    });

    if (review) {
      // Update existing review
      review.rating = createReviewDto.rating;
    } else {
      // Create new review
      review = this.reviewRepository.create({
        ...createReviewDto,
        userId: user.sub,
        movieId: movie.id,
      });
    }

    return this.reviewRepository.save(review);
  }

  async findAllReviewsByMovie(
    movieId: string,
    userId: string,
  ): Promise<Review[]> {
    const movie = await this.movieService.findOne(movieId, userId);
    if (!movie) {
      throw new NotFoundException(`Movie with ID "${movieId}" not found`);
    }
    return this.reviewRepository.find({
      where: { movieId },
      relations: ['user'],
    });
  }

  /**
   * Finds a single review made by a specific user for a specific movie.
   * This is useful for checking if a user has already reviewed a movie,
   * to retrieve their specific rating, or before attempting an update/delete.
   * @param userId The ID of the user.
   * @param movieId The ID of the movie.
   * @returns A Promise that resolves to the Review entity if found, or null otherwise.
   */
  async findOneReviewByUserAndMovie(
    userId: string,
    movieId: string,
  ): Promise<Review | null> {
    return this.reviewRepository.findOne({ where: { userId, movieId } });
  }

  async update(id: string, rating: number, userId: string): Promise<Review> {
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const review = await this.reviewRepository.findOne({
      where: { id, userId },
    });
    if (!review) {
      throw new NotFoundException(
        `Review with ID "${id}" not found or user not authorized`,
      );
    }
    review.rating = rating;
    return this.reviewRepository.save(review);
  }

  async remove(id: string, userId: string) {
    const review = await this.reviewRepository.findOne({
      where: { id, userId },
    });
    if (!review) {
      throw new NotFoundException(
        `Review with ID "${id}" not found or user not authorized`,
      );
    }
    await this.reviewRepository.delete(id);
    return { message: 'Review deleted successfully' };
  }
}
