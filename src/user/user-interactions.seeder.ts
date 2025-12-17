import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository, DeepPartial } from 'typeorm';
import { WatchHistory } from './entities/watch-history.entity';
import { Review } from '../review/entities/review.entity';
import { Comment } from '../comment/entities/comment.entity';
import { MyListEntity } from '../my-list/entities/my-list.entity';
import { Profile } from './entities/profile.entity';
import { Movie } from '../movie/entities/movie.entity';
import { MovieContentType } from '../movie/enums/movie-content-type.enum';
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

  private async hasAny(repo: Repository<any>): Promise<boolean> {
    const r = await repo
      .createQueryBuilder('e')
      .select('1')
      .limit(1)
      .getRawOne();
    return !!r;
  }

  async seed(): Promise<any> {
    // Check if data density is specified via environment variable
    const dataDensity =
      (process.env.DATA_DENSITY as DataDensity) || DataDensity.SPARSE;

    const [hasWatchHistory, hasReviews, hasComments, hasMyList] =
      await Promise.all([
        this.hasAny(this.watchHistoryRepository),
        this.hasAny(this.reviewRepository),
        this.hasAny(this.commentRepository),
        this.hasAny(this.myListRepository),
      ]);

    if (hasWatchHistory || hasReviews || hasComments || hasMyList) {
      this.logger.log('User interactions already seeded, skipping...');
      return;
    }

    const [profiles, movies] = await Promise.all([
      this.profileRepository.find({ select: { id: true, profileName: true } }),
      this.movieRepository.find({
        select: { id: true, contentType: true, seriesId: true, genres: true },
      }),
    ]);

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

    const concurrency = Number(process.env.SEED_CONCURRENCY || 4);
    for (let i = 0; i < profiles.length; i += concurrency) {
      const slice = profiles.slice(i, i + concurrency);
      await Promise.all(
        slice.map((profile) =>
          this.generateProfileInteractions(
            profile,
            movies,
            popularMovies,
            config,
            commentTemplates,
          ),
        ),
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

    const profileWatchedMovies = new Set<string>();
    const watchHistoryRows: DeepPartial<WatchHistory>[] = [];
    const reviewRows: DeepPartial<Review>[] = [];
    const commentRows: DeepPartial<Comment>[] = [];
    const myListRows: DeepPartial<MyListEntity>[] = [];
    const myListKeySet = new Set<string>();

    for (const movie of moviesToWatch) {
      const watchDurationInSeconds = faker.number.int({ min: 300, max: 7200 });
      const watchProgress = faker.number.float({
        min: 10,
        max: 100,
        fractionDigits: 1,
      });
      const isCompleted = watchProgress >= 90;
      const lastWatchedAt = faker.date.recent({ days: 30 });

      watchHistoryRows.push({
        profileId: profile.id,
        movieId: movie.id,
        lastWatchedAt,
        watchDurationInSeconds,
        watchProgress,
        isCompleted,
      });

      profileWatchedMovies.add(movie.id);

      if (isCompleted) {
        if (
          faker.datatype.boolean({ probability: config.reviewProbability }) &&
          movie.contentType !== MovieContentType.EPISODE
        ) {
          const rating = faker.helpers.weightedArrayElement([
            { value: 1, weight: 5 },
            { value: 2, weight: 10 },
            { value: 3, weight: 25 },
            { value: 4, weight: 40 },
            { value: 5, weight: 20 },
          ]);
          reviewRows.push({ profileId: profile.id, movieId: movie.id, rating });
        }
        if (
          faker.datatype.boolean({ probability: config.commentProbability })
        ) {
          const content = faker.helpers.arrayElement(commentTemplates);
          commentRows.push({
            profileId: profile.id,
            movieId: movie.id,
            content,
          });
        }
      }

      if (faker.datatype.boolean({ probability: config.myListProbability })) {
        const targetId =
          movie.contentType === MovieContentType.EPISODE && movie.seriesId
            ? movie.seriesId
            : movie.id;
        const key = `${profile.id}|${targetId}`;
        if (!myListKeySet.has(key)) {
          myListKeySet.add(key);
          myListRows.push({ profileId: profile.id, movieId: targetId });
        }
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
        const targetId =
          movie.contentType === MovieContentType.EPISODE && movie.seriesId
            ? movie.seriesId
            : movie.id;
        const key = `${profile.id}|${targetId}`;
        if (!myListKeySet.has(key)) {
          myListKeySet.add(key);
          myListRows.push({ profileId: profile.id, movieId: targetId });
        }
      }
    }

    await this.watchHistoryRepository.manager.transaction(async (em) => {
      const wh = em.getRepository(WatchHistory);
      const rv = em.getRepository(Review);
      const cm = em.getRepository(Comment);
      const ml = em.getRepository(MyListEntity);

      if (watchHistoryRows.length) {
        for (let i = 0; i < watchHistoryRows.length; i += 500) {
          await wh
            .createQueryBuilder()
            .insert()
            .values(watchHistoryRows.slice(i, i + 500))
            .execute();
        }
      }
      if (reviewRows.length) {
        for (let i = 0; i < reviewRows.length; i += 500) {
          await rv
            .createQueryBuilder()
            .insert()
            .values(reviewRows.slice(i, i + 500))
            .onConflict('("profileId","movieId") DO NOTHING')
            .execute();
        }
      }
      if (commentRows.length) {
        for (let i = 0; i < commentRows.length; i += 500) {
          await cm
            .createQueryBuilder()
            .insert()
            .values(commentRows.slice(i, i + 500))
            .execute();
        }
      }
      if (myListRows.length) {
        for (let i = 0; i < myListRows.length; i += 500) {
          await ml
            .createQueryBuilder()
            .insert()
            .values(myListRows.slice(i, i + 500))
            .onConflict('("profileId","movieId") DO NOTHING')
            .execute();
        }
      }
    });

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
