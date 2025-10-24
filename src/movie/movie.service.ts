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
import { AwsServicesService } from '../aws-services/aws-services.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MovieService {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly providersService: ProvidersService,
    private readonly myListService: MyListService,
    private readonly userService: UserService,
    private readonly awsServicesService: AwsServicesService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(MovieService.name);

  /**
   * Get MyList counts for multiple movies in a single query
   */
  private async getMyListCountsBatch(
    movieIds: string[],
  ): Promise<Record<string, number>> {
    if (movieIds.length === 0) return {};

    const result = await this.movieRepository
      .createQueryBuilder('movie')
      .leftJoin('movie.myList', 'myList')
      .where('movie.id IN (:...movieIds)', { movieIds })
      .select('movie.id', 'movieId')
      .addSelect('COUNT(myList.id)', 'count')
      .groupBy('movie.id')
      .getRawMany();

    const counts: Record<string, number> = {};
    result.forEach((row) => {
      counts[row.movieId] = parseInt(row.count || '0');
    });

    // Ensure all movie IDs have a count (even if 0)
    movieIds.forEach((id) => {
      if (!(id in counts)) {
        counts[id] = 0;
      }
    });

    return counts;
  }

  /**
   * Check if multiple movies are in a user's MyList in a single query
   */
  private async getUserMyListChecksBatch(
    profileId: string,
    movieIds: string[],
  ): Promise<Record<string, boolean>> {
    if (movieIds.length === 0) return {};

    const result = await this.myListService.getMyListItemsBatch(
      profileId,
      movieIds,
    );

    const checks: Record<string, boolean> = {};
    movieIds.forEach((id) => {
      checks[id] = result.includes(id);
    });

    return checks;
  }

  /**
   * Generate presigned URLs for a movie's media content
   */
  private async generateMoviePresignedUrls(movie: Movie) {
    try {
      const bucketName =
        this.configService.get('aws.bucketName') || 'test-cinego';

      const mediaUrls: { mainUrl?: string; trailerUrl?: string } = {};

      // Generate presigned URL for main content
      if (movie.mediaKeys?.main) {
        try {
          // Calculate expiration time: movie duration + 1 hour
          const movieDurationInSeconds = this.parseDurationToSeconds(
            movie.duration,
          );
          const mainExpirationTime = movieDurationInSeconds + 3600; // duration + 1 hour

          this.logger.debug(`Generating presigned URL for movie ${movie.id}:`, {
            duration: movie.duration,
            durationInSeconds: movieDurationInSeconds,
            expirationTime: mainExpirationTime,
            expirationTimeFormatted: `${Math.floor(mainExpirationTime / 3600)}h ${Math.floor((mainExpirationTime % 3600) / 60)}m`,
          });

          mediaUrls.mainUrl = await this.awsServicesService.getPresignedUrl(
            bucketName,
            movie.mediaKeys.main,
            mainExpirationTime,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to generate presigned URL for main content of movie ${movie.id}:`,
            error,
          );
        }
      }

      // Generate presigned URL for trailer
      if (movie.mediaKeys?.trailer) {
        try {
          // Trailer URLs expire after 1 hour
          const trailerExpirationTime = 3600; // 1 hour

          this.logger.debug(
            `Generating presigned URL for trailer of movie ${movie.id}:`,
            {
              expirationTime: trailerExpirationTime,
              expirationTimeFormatted: '1h 0m',
            },
          );

          mediaUrls.trailerUrl = await this.awsServicesService.getPresignedUrl(
            bucketName,
            movie.mediaKeys.trailer,
            trailerExpirationTime,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to generate presigned URL for trailer of movie ${movie.id}:`,
            error,
          );
        }
      }

      return mediaUrls;
    } catch (error) {
      this.logger.error(
        `Error generating presigned URLs for movie ${movie.id}:`,
        error,
      );
      return {};
    }
  }

  /**
   * Parse movie duration string to seconds
   * Handles formats like "120 min", "2h 30m", etc.
   */
  private parseDurationToSeconds(duration: string): number {
    if (!duration) return 3600; // Default to 1 hour if no duration

    const durationStr = duration.toLowerCase().trim();

    // Handle "120 min" format
    if (durationStr.includes('min')) {
      const minutes = parseInt(durationStr.replace('min', '').trim());
      return isNaN(minutes) ? 3600 : minutes * 60;
    }

    // Handle "2h 30m" format
    if (durationStr.includes('h') || durationStr.includes('m')) {
      let totalSeconds = 0;

      // Extract hours
      const hourMatch = durationStr.match(/(\d+)h/);
      if (hourMatch) {
        totalSeconds += parseInt(hourMatch[1]) * 3600;
      }

      // Extract minutes
      const minuteMatch = durationStr.match(/(\d+)m/);
      if (minuteMatch) {
        totalSeconds += parseInt(minuteMatch[1]) * 60;
      }

      return totalSeconds || 3600;
    }

    // Handle numeric only (assume minutes)
    const numericValue = parseInt(durationStr);
    if (!isNaN(numericValue)) {
      return numericValue * 60;
    }

    // Default fallback
    return 3600;
  }

  /**
   * Enrich multiple movies with MyList data and presigned URLs using batch queries
   */
  private async enrichMoviesWithMyListDataBatch(
    movies: Movie[],
    profileId: string,
  ) {
    if (movies.length === 0) return movies;

    const startTime = Date.now();
    const movieIds = movies.map((movie) => movie.id);

    // Get all counts and user checks in parallel
    const [counts, userChecks] = await Promise.all([
      this.getMyListCountsBatch(movieIds),
      profileId ? this.getUserMyListChecksBatch(profileId, movieIds) : {},
    ]);

    // Enrich each movie with the batch data
    const enrichedMovies = await Promise.all(
      movies.map(async (movie) => {
        // Do not generate or include mediaUrls anymore; using CloudFront cookies
        const { providerId, ...movieData } = movie as any;

        return {
          ...movieData, // keep mediaKeys in public responses
          myListCount: counts[movie.id] || 0,
          isInMyList: profileId ? userChecks[movie.id] || false : undefined,
        };
      }),
    );

    return enrichedMovies;
  }

  async getMovies(query: PaginateQuery, userId: string, profileId: string) {
    const movieCheck = await this.movieRepository.count();
    if (movieCheck < 1) {
      await this.fetchAndSaveMoviesFromProviders();
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
    return await this.searchMovies(
      query,
      profileId,
      userSubscriptionType,
      // userId,
    );
  }

  /**
   * Fetch movies from all active providers and save them to the database
   * This method includes duplicate validation to prevent saving the same movie twice
   */
  async fetchAndSaveMoviesFromProviders() {
    this.logger.log('Starting to fetch movies from providers...');

    const providers = await this.providersService.getActiveProviders();
    let totalNewMovies = 0;
    let totalSkippedMovies = 0;

    for (const provider of providers) {
      try {
        this.logger.log(`Fetching movies from provider: ${provider.name}`);
        const movies =
          await this.providersService.getMoviesFromProvider(provider);

        if (movies.length) {
          this.logger.log(
            `Found ${movies.length} movies from ${provider.name}`,
          );

          for (const movie of movies) {
            // Check for existing movie by providerTitleId to prevent duplicates
            const existingMovie = await this.movieRepository.findOne({
              where: { providerTitleId: movie.providerTitleId },
            });

            if (!existingMovie) {
              await this.movieRepository.save(movie);
              totalNewMovies++;
            } else {
              totalSkippedMovies++;
            }
          }
        } else {
          this.logger.log(`No movies found from provider: ${provider.name}`);
        }
      } catch (error) {
        this.logger.error(
          `Error fetching movies from provider ${provider.name}:`,
          error,
        );
      }
    }

    this.logger.log(
      `Provider fetch completed. New movies: ${totalNewMovies}, Skipped duplicates: ${totalSkippedMovies}`,
    );
    return {
      newMovies: totalNewMovies,
      skippedDuplicates: totalSkippedMovies,
      message: `Successfully fetched movies from providers. Added ${totalNewMovies} new movies, skipped ${totalSkippedMovies} duplicates.`,
    };
  }

  /**
   * Fetch movies from a specific provider and save them to the database
   * @param providerId - The ID of the provider to fetch from
   */
  async fetchMoviesFromSpecificProvider(providerId: string) {
    this.logger.log(`Fetching movies from specific provider: ${providerId}`);

    const provider = await this.providersService.findOne(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider with ID ${providerId} not found`);
    }

    if (!provider.isActive) {
      throw new ForbiddenException(`Provider ${provider.name} is not active`);
    }

    try {
      const movies =
        await this.providersService.getMoviesFromProvider(provider);
      let newMovies = 0;
      let skippedDuplicates = 0;

      if (movies.length) {
        this.logger.log(`Found ${movies.length} movies from ${provider.name}`);

        for (const movie of movies) {
          // Check for existing movie by providerTitleId to prevent duplicates
          const existingMovie = await this.movieRepository.findOne({
            where: { providerTitleId: movie.providerTitleId },
          });

          if (!existingMovie) {
            await this.movieRepository.save(movie);
            newMovies++;
          } else {
            skippedDuplicates++;
          }
        }
      } else {
        this.logger.log(`No movies found from provider: ${provider.name}`);
      }

      this.logger.log(
        `Provider fetch completed for ${provider.name}. New movies: ${newMovies}, Skipped duplicates: ${skippedDuplicates}`,
      );
      return {
        provider: provider.name,
        newMovies,
        skippedDuplicates,
        message: `Successfully fetched movies from ${provider.name}. Added ${newMovies} new movies, skipped ${skippedDuplicates} duplicates.`,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching movies from provider ${provider.name}:`,
        error,
      );
      throw new InternalServerErrorException(
        `Failed to fetch movies from ${provider.name}: ${error.message}`,
      );
    }
  }

  async searchMovies(
    query: PaginateQuery,
    profileId: string,
    userSubscriptionType: SubscriptionType,
    // userId?: string,
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
        'programType',
        'marketRating',
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

    // Enrich movies with MyList data using batch optimization
    const enrichedMovies = await this.enrichMoviesWithMyListDataBatch(
      result.data,
      profileId,
    );

    return {
      ...result,
      data: enrichedMovies,
    };
  }

  async findOne(id: string, userId: string, profileId: string) {
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

    const enrichedMovies = await this.enrichMoviesWithMyListDataBatch(
      [movie],
      profileId,
    );
    const enrichedMovie = enrichedMovies[0];
    // Keep mediaKeys, strip providerId only
    const { providerId, ...movieData } = enrichedMovie as any;

    return { data: movieData };
  }

  async findByGenre(genre: string, userId: string, profileId: string) {
    console.log('FINDING BY GENRE', genre, userId, profileId);
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

    // Select specific fields to avoid exposing sensitive ones like mediaKeys by default
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
    console.log('RESULT', result);

    // Enrich movies with MyList data using batch optimization
    const enrichedMovies = await this.enrichMoviesWithMyListDataBatch(
      result,
      profileId,
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
  //     Key: movie.mediaKeys.main,
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
    const { mediaKeys, providerId, ...movieData } = movie; // Exclude sensitive fields
    return movieData as Movie; // Ensure the returned type matches, adjust if necessary
  }

  // Admin-only helpers (no subscription gating, sanitized fields)
  async adminFindAllPaginated(query: PaginateQuery) {
    const paginateConfig: PaginateConfig<Movie> = {
      sortableColumns: ['dateCreated', 'productionYear', 'title'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: [
        'title',
        'director',
        'cast',
        'synopsis',
        'genres',
        'languages',
        'programType',
        'marketRating',
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
        isPremium: true,
        providerId: true,
      },
      select: [
        'id',
        'title',
        'providerId',
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
        'mediaKeys',
        'dateCreated',
        'isPremium',
      ],
    };

    return await paginate(query, this.movieRepository, paginateConfig);
  }

  async adminFindOne(id: string) {
    const movie = await this.movieRepository.findOne({ where: { id } });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    // Admin view returns full movie data including providerId and mediaKeys
    return movie as any;
  }

  async adminUpdate(
    id: string,
    update: Partial<{
      title: string;
      synopsis: string;
      productionYear: string;
      marketRating: string;
      isHD: boolean;
      director: string;
      cast: string[];
      genres: string[];
      languages: string[];
      duration: string;
      isPremium: boolean;
      images: Movie['images'];
      mediaKeys: Movie['mediaKeys'];
      programType: string;
      providerId: string;
      providerTitleId: string;
    }>,
  ) {
    const movie = await this.movieRepository.findOne({ where: { id } });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    // Validate providerId if present
    if (Object.prototype.hasOwnProperty.call(update, 'providerId')) {
      const newProviderId = update.providerId as string;
      if (newProviderId) {
        await this.providersService.adminFindOne(newProviderId); // throws NotFound if invalid
      } else {
        // Empty providerId is invalid
        throw new NotFoundException('Provider not found');
      }
    }
    // Only assign allowed fields
    const allowedKeys: Array<keyof Movie | keyof typeof update> = [
      'title',
      'synopsis',
      'productionYear',
      'marketRating',
      'isHD',
      'director',
      'cast',
      'genres',
      'languages',
      'duration',
      'isPremium',
      'images',
      'mediaKeys',
      'programType',
      'providerId',
      'providerTitleId',
    ];
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(update, key)) {
        // @ts-expect-error intentional dynamic assignment within allowed keys
        movie[key] = update[key as keyof typeof update] as any;
      }
    }
    const saved = await this.movieRepository.save(movie);
    // Return full entity for admin update (including providerId and mediaKeys)
    return saved as any;
  }

  async adminDelete(id: string) {
    const result = await this.movieRepository.delete({ id });
    return result.affected ?? 0;
  }
}
