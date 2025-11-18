import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { MovieService } from '../movie/movie.service';
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    private readonly movieService: MovieService,
  ) {}

  async upsert(
    createReviewDto: CreateReviewDto,
    profileId: string,
    user: { sub: string; role: string },
  ): Promise<Review> {
    if (createReviewDto.rating < 1 || createReviewDto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const movieResponse = await this.movieService.findOne(
      createReviewDto.movieId,
      user.sub,
      profileId,
    );

    const movie = movieResponse.data;

    if (!movie || !movie.id) {
      throw new NotFoundException(
        `Movie with ID "${createReviewDto.movieId}" not found or invalid movie data returned`,
      );
    }

    let review = await this.reviewRepository.findOne({
      where: { profileId: profileId, movieId: movie.id },
    });

    if (review) {
      // Update existing review
      review.rating = createReviewDto.rating;
      if (typeof createReviewDto.content !== 'undefined') {
        review.content = createReviewDto.content;
      }
    } else {
      // Create new review
      review = this.reviewRepository.create({
        ...createReviewDto,
        profileId: profileId,
        movieId: movie.id,
      });
    }

    return this.reviewRepository.save(review);
  }

  async getMovieRatingSummary(movieId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    ratingDistribution: { [key: number]: number };
  }> {
    const reviews = await this.reviewRepository.find({
      where: { movieId },
      select: ['rating'],
    });

    if (reviews.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = Math.round((totalRating / reviews.length) * 10) / 10; // Round to 1 decimal place

    // Calculate rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((review) => {
      ratingDistribution[review.rating]++;
    });

    return {
      averageRating,
      totalReviews: reviews.length,
      ratingDistribution,
    };
  }

  async getMovieReviews(query: PaginateQuery, movieId: string) {
    const paginateConfig: PaginateConfig<Review> = {
      sortableColumns: ['dateCreated', 'rating'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: [],
      defaultLimit: 10,
      filterableColumns: {
        rating: true,
      },
      select: [
        'id',
        'rating',
        'content',
        'movieId',
        'profileId',
        'dateCreated',
        'dateUpdated',
      ],
    };

    const queryBuilder = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.profile', 'profile')
      .where('review.movieId = :movieId', { movieId });

    return await paginate(query, queryBuilder, paginateConfig);
  }

  async findAllReviewsByMovie(
    movieId: string,
    userId: string,
    profileId: string,
  ): Promise<Review[]> {
    const movie = await this.movieService.findOne(movieId, userId, profileId);
    if (!movie) {
      throw new NotFoundException(`Movie with ID "${movieId}" not found`);
    }
    return this.reviewRepository.find({
      where: { movieId },
      relations: ['profile'],
    });
  }

  /**
   * Finds a single review made by a specific profile for a specific movie.
   * This is useful for checking if a profile has already reviewed a movie,
   * to retrieve their specific rating, or before attempting an update/delete.
   * @param profileId The ID of the profile.
   * @param movieId The ID of the movie.
   * @returns A Promise that resolves to the Review entity if found, or null otherwise.
   */
  async findOneReviewByProfileAndMovie(
    profileId: string,
    movieId: string,
  ): Promise<Review | null> {
    return this.reviewRepository.findOne({ where: { profileId, movieId } });
  }

  async update(
    id: string,
    updateReviewDto: UpdateReviewDto,
    profileId: string,
  ): Promise<Review> {
    if (
      typeof updateReviewDto.rating !== 'undefined' &&
      (updateReviewDto.rating < 1 || updateReviewDto.rating > 5)
    ) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const review = await this.reviewRepository.findOne({
      where: { id, profileId },
    });
    if (!review) {
      throw new NotFoundException(
        `Review with ID "${id}" not found or profile not authorized`,
      );
    }

    if (typeof updateReviewDto.rating !== 'undefined') {
      review.rating = updateReviewDto.rating;
    }
    if (typeof updateReviewDto.content !== 'undefined') {
      review.content = updateReviewDto.content;
    }

    return this.reviewRepository.save(review);
  }

  async remove(id: string, profileId: string) {
    const review = await this.reviewRepository.findOne({
      where: { id, profileId },
    });
    if (!review) {
      throw new NotFoundException(
        `Review with ID "${id}" not found or profile not authorized`,
      );
    }
    await this.reviewRepository.delete(id);
    return { message: 'Review deleted successfully' };
  }
}
