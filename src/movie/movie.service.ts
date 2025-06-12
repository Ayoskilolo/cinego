import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Movie } from './entities/movie.entity';
import { Repository } from 'typeorm';
import { PaginateQuery, paginate, PaginateConfig } from 'nestjs-paginate';
import { ProvidersService } from 'src/providers/providers.service';
import { MyListService } from '../my-list/my-list.service';
import { UserService } from '../user/user.service';
import { SubscriptionType } from '../user/enum/userType';

@Injectable()
export class MovieService {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly providersService: ProvidersService,
    private readonly myListService: MyListService,
    private readonly userService: UserService,
  ) {}

  private readonly logger = new Logger(MovieService.name);

  private async getMyListCount(movieId: string): Promise<number> {
    const result = await this.movieRepository
      .createQueryBuilder('movie')
      .leftJoin('movie.myList', 'myList')
      .where('movie.id = :id', { id: movieId })
      .select('COUNT(myList.id)', 'count')
      .getRawOne();

    return parseInt(result?.count || '0');
  }

  private async enrichMovieWithMyListData(movie: Movie, userId?: string) {
    const myListCount = await this.getMyListCount(movie.id);
    return {
      ...movie,
      myListCount,
      isInMyList: userId
        ? await this.myListService.isInMyList(userId, movie.id)
        : undefined,
    };
  }

  async getMovies(query: PaginateQuery, userId?: string) {
    const movieCheck = await this.movieRepository.count();
    if (movieCheck < 1) {
      // call all active providers api and save to db
      const providers = await this.providersService.getActiveProviders();
      for (const provider of providers) {
        const movies =
          await this.providersService.getMoviesFromProvider(provider);

        if (movies.length) {
          for (const movie of movies) {
            const existingMovie = await this.movieRepository.findOne({
              where: { providerTitleId: movie.providerTitleId },
            });

            if (!existingMovie) {
              await this.movieRepository.save(movie);
            }
          }
        }
      }
    }
    let userSubscriptionType: SubscriptionType | undefined;
    if (userId) {
      try {
        const user = await this.userService.findOne(userId); // Use userService to get user details
        if (user) {
          userSubscriptionType = user.subscriptionType;
        } else {
          this.logger.warn(
            `User not found for ID: ${userId} in getMovies. Proceeding without subscription filtering.`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Error fetching user ${userId} in getMovies: ${error.message}. Proceeding without subscription filtering.`,
        );
      }
    }
    return await this.searchMovies(query, userId, userSubscriptionType);
  }

  async searchMovies(
    query: PaginateQuery,
    userId?: string,
    userSubscriptionType?: SubscriptionType,
  ) {
    const paginateConfig: PaginateConfig<Movie> = {
      sortableColumns: ['dateCreated', 'productionYear'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: [
        'title',
        'director',
        'cast',
        'synopsis',
        'genres',
        'languages',
      ],
      defaultLimit: 10,
      filterableColumns: {
        isHD: true,
        programType: true,
        productionYear: true,
        marketRating: true,
        director: true,
        genres: true,
        languages: true,
        // isPremium is NOT filterable by user query params, enforced server-side
      },
      select: [
        'id',
        'title',
        'providerTitleId',
        'programType',
        'synopsis',
        'productionYear',
        'marketRating',
        'isHD',
        'director',
        'cast',
        'genres',
        'languages',
        'duration',
        'images',
        'dateCreated',
        'isPremium', // Ensure isPremium is selected
      ],
    };

    if (
      userSubscriptionType &&
      (userSubscriptionType === SubscriptionType.FREEMIUM ||
        userSubscriptionType === SubscriptionType.FREE_TIER)
    ) {
      paginateConfig.where = { isPremium: false }; // Filter for non-premium movies
    }

    const result = await paginate(query, this.movieRepository, paginateConfig);

    // Enrich movies with MyList data
    const enrichedMovies = await Promise.all(
      result.data.map((movie) => this.enrichMovieWithMyListData(movie, userId)),
    );

    return {
      ...result,
      data: enrichedMovies,
    };
  }

  async findOne(id: string, userId: string) {
    const movie = await this.movieRepository.findOne({
      where: { id },
    });

    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    if (movie.isPremium) {
      if (!userId) {
        // Anonymous user
        throw new ForbiddenException(
          'Premium content. Please log in and subscribe to access.',
        );
      }
      // Authenticated user, check subscription
      try {
        const user = await this.userService.findOne(userId);
        // userService.findOne throws NotFoundException if user doesn't exist.
        if (
          user.subscriptionType === SubscriptionType.FREEMIUM ||
          user.subscriptionType === SubscriptionType.FREE_TIER
        ) {
          throw new ForbiddenException(
            'Your current subscription plan does not allow access to this premium movie.',
          );
        }
      } catch (error) {
        if (error instanceof ForbiddenException) throw error;
        if (error instanceof NotFoundException) {
          // User not found by userService
          this.logger.warn(
            `User with ID ${userId} not found during premium access check for movie ${id}.`,
          );
          throw new ForbiddenException(
            'User not found, access to premium content denied.',
          );
        }
        this.logger.error(
          `Error during premium access check for movie ${id} by user ${userId}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Could not verify access for premium content due to an internal error.',
        );
      }
    }

    const enrichedMovie = await this.enrichMovieWithMyListData(movie, userId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { s3ObjectKey, providerId, ...movieData } = enrichedMovie;

    return { data: movieData };
  }

  async findByGenre(genre: string, userId?: string) {
    let userSubscriptionType: SubscriptionType | undefined;
    if (userId) {
      try {
        const user = await this.userService.findOne(userId);
        if (user) {
          userSubscriptionType = user.subscriptionType;
        } else {
          this.logger.warn(`User not found for ID: ${userId} in findByGenre.`);
        }
      } catch (error) {
        this.logger.warn(
          `Error fetching user ${userId} in findByGenre: ${error.message}.`,
        );
      }
    }

    const queryBuilder = this.movieRepository
      .createQueryBuilder('movie')
      .where(':genre = ANY(movie.genres)', { genre: genre.toLowerCase() });

    if (
      userSubscriptionType &&
      (userSubscriptionType === SubscriptionType.FREEMIUM ||
        userSubscriptionType === SubscriptionType.FREE_TIER)
    ) {
      queryBuilder.andWhere('movie.isPremium = :isPremium', {
        isPremium: false,
      });
    }

    // Select specific fields to avoid exposing sensitive ones like s3ObjectKey by default
    queryBuilder.select([
      'movie.id',
      'movie.title',
      'movie.providerTitleId',
      'movie.programType',
      'movie.synopsis',
      'movie.productionYear',
      'movie.marketRating',
      'movie.isHD',
      'movie.director',
      'movie.cast',
      'movie.genres',
      'movie.languages',
      'movie.duration',
      'movie.images',
      'movie.dateCreated',
      'movie.isPremium',
    ]);
    const result = await queryBuilder.getMany();

    // Enrich movies with MyList data
    const enrichedMovies = await Promise.all(
      result.map((movie) => this.enrichMovieWithMyListData(movie, userId)),
    );

    return { data: enrichedMovies };
  }

  async findAllGenres() {
    try {
      const result = await this.movieRepository
        .createQueryBuilder('movie')
        .select('DISTINCT UNNEST(movie.genres)', 'genre')
        .orderBy('genre', 'ASC')
        .getRawMany();

      const data = result.map((item) => item.genre);

      return { data };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching genres');
    }
  }
  // async getStreamingUrl(movieId: string): Promise<string> {
  //   // const movie = await this.movieRepository.findOne(movieId);

  //   if (!movie) {
  //     throw new Error('Movie not found');
  //   }

  //   const params = {
  //     Bucket: process.env.S3_BUCKET_NAME,
  //     Key: movie.s3ObjectKey,
  //     Expires: 3600, // URL expires in 1 hour
  //   };

  //   return this.s3.getSignedUrlPromise('getObject', params);
  // }

  remove(id: number) {
    return `This action removes a #${id} movie`;
  }

  async setMoviePremiumStatus(
    movieId: string,
    isPremium: boolean,
  ): Promise<Movie> {
    const movie = await this.movieRepository.findOne({
      where: { id: movieId },
    });
    if (!movie) {
      throw new NotFoundException(`Movie with ID "${movieId}" not found`);
    }
    movie.isPremium = isPremium;
    await this.movieRepository.save(movie);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { s3ObjectKey, providerId, ...movieData } = movie; // Exclude sensitive fields
    return movieData as Movie; // Ensure the returned type matches, adjust if necessary
  }
}
