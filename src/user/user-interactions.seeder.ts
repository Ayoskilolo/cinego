import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { WatchHistory } from './entities/watch-history.entity';
import { Review } from '../review/entities/review.entity';
import { Comment } from '../comment/entities/comment.entity';
import { MyListEntity } from '../my-list/entities/my-list.entity';
import { Profile } from './entities/profile.entity';
import { Movie } from '../movie/entities/movie.entity';
import { faker } from '@faker-js/faker';

export enum DataDensity {
  SPARSE = 'sparse',
  DENSE = 'dense',
}

@Injectable()
export class UserInteractionsSeeder implements Seeder {
  constructor(
    @InjectRepository(WatchHistory)
    private readonly watchHistoryRepository: Repository<WatchHistory>,
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(MyListEntity)
    private readonly myListRepository: Repository<MyListEntity>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}
  private readonly logger = new Logger(UserInteractionsSeeder.name);

  async seed(): Promise<any> {
    // Check if data density is specified via environment variable
    const dataDensity =
      (process.env.DATA_DENSITY as DataDensity) || DataDensity.SPARSE;

    const existingWatchHistory = await this.watchHistoryRepository.count();
    const existingReviews = await this.reviewRepository.count();
    const existingComments = await this.commentRepository.count();
    const existingMyList = await this.myListRepository.count();

    if (
      existingWatchHistory > 0 ||
      existingReviews > 0 ||
      existingComments > 0 ||
      existingMyList > 0
    ) {
      this.logger.log('User interactions already seeded, skipping...');
      return;
    }

    // Get all profiles and movies
    const profiles = await this.profileRepository.find();
    const movies = await this.movieRepository.find();

    if (profiles.length === 0) {
      this.logger.error('No profiles found. Please run the user seeder first.');
      return;
    }

    if (movies.length === 0) {
      this.logger.error('No movies found. Please run the movie seeder first.');
      return;
    }

    this.logger.log(
      `Found ${profiles.length} profiles and ${movies.length} movies. Using ${dataDensity} data density.`,
    );

    // Sample comment templates for realistic content
    const commentTemplates = [
      'This movie was absolutely amazing! The plot was incredible and the acting was top-notch.',
      'I really enjoyed this film. The cinematography was beautiful and the story was engaging.',
      'Not bad, but I expected more. The ending was a bit disappointing.',
      'Great movie! I would definitely recommend it to others.',
      'The special effects were impressive, but the story could have been better.',
      "This is one of my favorite movies now. I've watched it multiple times!",
      'The acting was superb, especially the lead role. Really brought the character to life.',
      'I found this movie to be quite entertaining. Perfect for a weekend watch.',
      'The soundtrack was incredible and really added to the atmosphere.',
      'A solid film overall. Not groundbreaking but definitely worth watching.',
      'I was on the edge of my seat throughout the entire movie!',
      'The director did an excellent job with this one. Very well crafted.',
      'This movie exceeded my expectations. Highly recommend!',
      'The plot twists were unexpected and kept me guessing until the end.',
      'Beautiful cinematography and a compelling story. What more could you ask for?',
      "I wasn't sure about this one at first, but I'm glad I gave it a chance.",
      'The character development was really well done.',
      'This movie had me laughing and crying. Such a rollercoaster of emotions!',
      'The production quality was outstanding. You can tell they put a lot of effort into it.',
      "I can't stop thinking about this movie. It really made an impact on me.",
    ];

    // Configure data density parameters
    const config = this.getDataDensityConfig(dataDensity, movies.length);

    // Create popular movies that many users will interact with (for dense data)
    const popularMovies =
      dataDensity === DataDensity.DENSE
        ? this.createPopularMovies(movies, config.popularMovieCount)
        : [];

    // Generate interactions for each profile
    for (const profile of profiles) {
      await this.generateProfileInteractions(
        profile,
        movies,
        popularMovies,
        config,
        commentTemplates,
      );
    }

    this.logger.log(
      `Successfully seeded user interactions with ${dataDensity} density`,
    );
  }

  private getDataDensityConfig(density: DataDensity, totalMovies: number) {
    switch (density) {
      case DataDensity.SPARSE:
        return {
          watchedMoviesMin: 5,
          watchedMoviesMax: 15,
          popularMovieCount: 0,
          reviewProbability: 0.4,
          commentProbability: 0.25,
          myListProbability: 0.6,
          futureWatchingMin: 2,
          futureWatchingMax: 8,
        };
      case DataDensity.DENSE:
        return {
          watchedMoviesMin: 25, // High minimum but realistic
          watchedMoviesMax: 40, // Most movies but not all
          popularMovieCount: Math.floor(totalMovies * 0.4), // 40% popular movies for overlap
          reviewProbability: 0.85, // Higher review rate
          commentProbability: 0.7, // Higher comment rate
          myListProbability: 0.9, // Higher my list rate
          futureWatchingMin: 8,
          futureWatchingMax: 20,
        };
      default:
        // Default to sparse if density is not recognized
        return {
          watchedMoviesMin: 5,
          watchedMoviesMax: 15,
          popularMovieCount: 0,
          reviewProbability: 0.4,
          commentProbability: 0.25,
          myListProbability: 0.6,
          futureWatchingMin: 2,
          futureWatchingMax: 8,
        };
    }
  }

  private createPopularMovies(
    allMovies: Movie[],
    popularCount: number,
  ): Movie[] {
    // For dense data: select movies that will have high overlap
    // Prioritize movies with broader appeal (action, drama, comedy genres)
    const popularGenres = ['action', 'drama', 'comedy', 'romance', 'thriller'];

    const popularMovies = allMovies.filter(
      (movie) =>
        movie.genres &&
        movie.genres.some((genre) => popularGenres.includes(genre)),
    );

    // If we don't have enough popular genre movies, add random ones
    if (popularMovies.length < popularCount) {
      const remainingMovies = allMovies.filter(
        (movie) => !popularMovies.includes(movie),
      );
      const additionalMovies = faker.helpers.arrayElements(
        remainingMovies,
        popularCount - popularMovies.length,
      );
      return [...popularMovies, ...additionalMovies];
    }

    // Return the requested number of popular movies
    return faker.helpers.arrayElements(popularMovies, popularCount);
  }

  private async generateProfileInteractions(
    profile: Profile,
    allMovies: Movie[],
    popularMovies: Movie[],
    config: any,
    commentTemplates: string[],
  ) {
    let moviesToWatch: Movie[];

    if (popularMovies.length > 0) {
      // For dense data: ensure popular movies are included with high probability
      const popularMoviesToInclude = faker.helpers.arrayElements(
        popularMovies,
        Math.min(
          popularMovies.length,
          faker.number.int({
            min: Math.floor(popularMovies.length * 0.6), // 60% of popular movies
            max: popularMovies.length,
          }),
        ),
      );

      const otherMovies = allMovies.filter(
        (movie) => !popularMovies.includes(movie),
      );

      // Calculate remaining slots for other movies
      const remainingMin = Math.max(
        0,
        config.watchedMoviesMin - popularMoviesToInclude.length,
      );
      const remainingMax = Math.max(
        remainingMin,
        config.watchedMoviesMax - popularMoviesToInclude.length,
      );

      const otherMoviesToWatch = faker.helpers.arrayElements(
        otherMovies,
        faker.number.int({
          min: remainingMin,
          max: Math.min(remainingMax, otherMovies.length),
        }),
      );

      moviesToWatch = [...popularMoviesToInclude, ...otherMoviesToWatch];
    } else {
      // For sparse data: random selection
      const numberOfWatchedMovies = faker.number.int({
        min: config.watchedMoviesMin,
        max: Math.min(config.watchedMoviesMax, allMovies.length),
      });
      moviesToWatch = faker.helpers.arrayElements(
        allMovies,
        numberOfWatchedMovies,
      );
    }

    // Track which movies this profile has watched for realistic interactions
    const profileWatchedMovies = new Set<string>();

    for (const movie of moviesToWatch) {
      try {
        // Generate realistic watch data
        const watchDurationInSeconds = faker.number.int({
          min: 300,
          max: 7200,
        }); // 5 min to 2 hours
        const watchProgress = faker.number.float({
          min: 10,
          max: 100,
          fractionDigits: 1,
        });
        const isCompleted = watchProgress >= 90; // Consider completed if watched 90% or more

        // Generate realistic last watched date (within last 30 days)
        const lastWatchedAt = faker.date.recent({ days: 30 });

        const watchHistory: Partial<WatchHistory> = {
          profileId: profile.id,
          movieId: movie.id,
          lastWatchedAt,
          watchDurationInSeconds,
          watchProgress,
          isCompleted,
        };

        const watchHistoryEntity =
          this.watchHistoryRepository.create(watchHistory);
        await this.watchHistoryRepository.save(watchHistoryEntity);

        profileWatchedMovies.add(movie.id);

        // If they completed the movie, they're more likely to interact with it
        if (isCompleted) {
          // Review probability based on data density
          if (
            faker.datatype.boolean({ probability: config.reviewProbability })
          ) {
            const rating = faker.helpers.weightedArrayElement([
              { value: 1, weight: 5 },
              { value: 2, weight: 10 },
              { value: 3, weight: 25 },
              { value: 4, weight: 40 },
              { value: 5, weight: 20 },
            ]);

            const review: Partial<Review> = {
              profileId: profile.id,
              movieId: movie.id,
              rating,
            };

            const reviewEntity = this.reviewRepository.create(review);
            await this.reviewRepository.save(reviewEntity);
          }

          // Comment probability based on data density
          if (
            faker.datatype.boolean({ probability: config.commentProbability })
          ) {
            const commentContent = faker.helpers.arrayElement(commentTemplates);

            const comment: Partial<Comment> = {
              profileId: profile.id,
              movieId: movie.id,
              content: commentContent,
            };

            const commentEntity = this.commentRepository.create(comment);
            await this.commentRepository.save(commentEntity);
          }
        }

        // MyList probability based on data density
        if (faker.datatype.boolean({ probability: config.myListProbability })) {
          const myListItem: Partial<MyListEntity> = {
            profileId: profile.id,
            movieId: movie.id,
          };

          const myListEntity = this.myListRepository.create(myListItem);
          await this.myListRepository.save(myListEntity);
        }
      } catch (error) {
        this.logger.error(
          `Unable to seed interactions for profile ${profile.profileName} and movie ${movie.title}`,
          error,
        );
      }
    }

    // Add some movies to watchlist that they haven't watched yet (for future watching)
    const unwatchedMovies = allMovies.filter(
      (movie) => !profileWatchedMovies.has(movie.id),
    );
    if (unwatchedMovies.length > 0) {
      const numberOfUnwatchedForList = faker.number.int({
        min: config.futureWatchingMin,
        max: Math.min(config.futureWatchingMax, unwatchedMovies.length),
      });
      const moviesForFutureWatching = faker.helpers.arrayElements(
        unwatchedMovies,
        numberOfUnwatchedForList,
      );

      for (const movie of moviesForFutureWatching) {
        try {
          const myListItem: Partial<MyListEntity> = {
            profileId: profile.id,
            movieId: movie.id,
          };

          const myListEntity = this.myListRepository.create(myListItem);
          await this.myListRepository.save(myListEntity);
        } catch (error) {
          this.logger.error(
            `Unable to seed my-list entry for profile ${profile.profileName} and movie ${movie.title}`,
            error,
          );
        }
      }
    }

    this.logger.log(
      `Seeded interactions for profile: ${profile.profileName} (${moviesToWatch.length} watched, interactions created)`,
    );
  }

  drop(): Promise<any> {
    return Promise.all([
      this.watchHistoryRepository.delete({}),
      this.reviewRepository.delete({}),
      this.commentRepository.delete({}),
      this.myListRepository.delete({}),
    ]);
  }
}
