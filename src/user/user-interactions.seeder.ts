import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository, DeepPartial } from 'typeorm';
import { WatchHistory } from './entities/watch-history.entity';
import { Review } from '../review/entities/review.entity';
import { Comment } from '../comment/entities/comment.entity';
import { BlogComment } from '../blogs/entity/blog-comment.entity';
import { Blog } from '../blogs/entity/blog.entity';
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
    @InjectRepository(BlogComment)
    private readonly blogCommentRepository: Repository<BlogComment>,
    @InjectRepository(Blog)
    private readonly blogRepository: Repository<Blog>,
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

    const [
      hasWatchHistory,
      hasReviews,
      hasComments,
      hasMyList,
      hasBlogComments,
    ] = await Promise.all([
      this.hasAny(this.watchHistoryRepository),
      this.hasAny(this.reviewRepository),
      this.hasAny(this.commentRepository),
      this.hasAny(this.myListRepository),
      this.hasAny(this.blogCommentRepository),
    ]);

    if (
      hasWatchHistory ||
      hasReviews ||
      hasComments ||
      hasMyList ||
      hasBlogComments
    ) {
      this.logger.log('User interactions already seeded, skipping...');
      return;
    }

    const [profiles, movies, blogs] = await Promise.all([
      this.profileRepository.find({ select: { id: true, profileName: true } }),
      this.movieRepository.find({
        select: { id: true, contentType: true, seriesId: true, genres: true },
      }),
      this.blogRepository.find({ select: { id: true, title: true } }),
    ]);

    if (profiles.length === 0) {
      this.logger.error('No profiles found. Please run the user seeder first.');
      return;
    }

    if (movies.length === 0) {
      this.logger.error('No movies found. Please run the movie seeder first.');
      return;
    }

    if (blogs.length === 0) {
      this.logger.warn('No blogs found. Skipping blog comment seeding.');
    }

    this.logger.log(
      `Found ${profiles.length} profiles, ${movies.length} movies, and ${blogs.length} blogs. Using ${dataDensity} data density.`,
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

    // Blog comment templates for realistic content
    const blogCommentTemplates = [
      'Great article! Very informative and well-written.',
      'Thanks for sharing this. I learned a lot from reading it.',
      'I completely agree with your points. Well said!',
      'This is exactly what I was looking for. Thank you!',
      'Interesting perspective. I never thought about it this way.',
      'Love the insights in this post. Keep up the great work!',
      'Very helpful article. I will definitely share this with my friends.',
      'The analysis in this piece is spot on. Excellent work!',
      'I have a slightly different view, but I appreciate the well-researched content.',
      'This blog post really opened my eyes to new ideas. Thanks for writing it!',
      'Bookmarking this for future reference. Such valuable information.',
      'The writing style is engaging and easy to follow. Great job!',
      'I had no idea about this topic before reading. Very enlightening!',
      'This is why I love reading this blog. Always quality content.',
      "Couldn't agree more with the main points. Well articulated!",
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
            blogs,
            blogCommentTemplates,
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
          blogCommentProbability: 0.2,
          blogsToCommentMin: 1,
          blogsToCommentMax: 3,
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
          blogCommentProbability: 0.6,
          blogsToCommentMin: 3,
          blogsToCommentMax: 8,
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
          blogCommentProbability: 0.2,
          blogsToCommentMin: 1,
          blogsToCommentMax: 3,
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
    blogs: Blog[],
    blogCommentTemplates: string[],
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
    const reviewedMovieIds = new Set<string>(); // Track reviewed movies to avoid duplicates
    const commentRows: DeepPartial<Comment>[] = [];
    const blogCommentRows: DeepPartial<BlogComment>[] = [];
    const myListRows: DeepPartial<MyListEntity>[] = [];
    const myListKeySet = new Set<string>();

    for (const movie of moviesToWatch) {
      // Skip watch history for SERIES (only FILM and EPISODE are watchable)
      if (movie.contentType !== MovieContentType.SERIES) {
        const watchDurationInSeconds = faker.number.int({
          min: 300,
          max: 7200,
        });
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
          // Reviews can be on any content type (film, series, or episode)
          if (
            faker.datatype.boolean({ probability: config.reviewProbability })
          ) {
            // Only add review if we haven't already reviewed this movie/episode
            if (!reviewedMovieIds.has(movie.id)) {
              const rating = faker.helpers.weightedArrayElement([
                { value: 1, weight: 5 },
                { value: 2, weight: 10 },
                { value: 3, weight: 25 },
                { value: 4, weight: 40 },
                { value: 5, weight: 20 },
              ]);
              reviewRows.push({
                profileId: profile.id,
                movieId: movie.id,
                rating,
              });
              reviewedMovieIds.add(movie.id);
            }
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
      } else {
        // For SERIES, just track as "watched" for future watchlist logic
        profileWatchedMovies.add(movie.id);
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

    // Generate blog comments
    if (
      blogs.length > 0 &&
      faker.datatype.boolean({ probability: config.blogCommentProbability })
    ) {
      const numberOfBlogsToComment = faker.number.int({
        min: config.blogsToCommentMin,
        max: Math.min(config.blogsToCommentMax, blogs.length),
      });
      const blogsToComment = faker.helpers.arrayElements(
        blogs,
        numberOfBlogsToComment,
      );

      for (const blog of blogsToComment) {
        const content = faker.helpers.arrayElement(blogCommentTemplates);
        blogCommentRows.push({
          profileId: profile.id,
          blogId: blog.id,
          content,
        });
      }
    }

    await this.watchHistoryRepository.manager.transaction(async (em) => {
      const wh = em.getRepository(WatchHistory);
      const rv = em.getRepository(Review);
      const cm = em.getRepository(Comment);
      const bc = em.getRepository(BlogComment);
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
      if (blogCommentRows.length) {
        for (let i = 0; i < blogCommentRows.length; i += 500) {
          await bc
            .createQueryBuilder()
            .insert()
            .values(blogCommentRows.slice(i, i + 500))
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
      this.blogCommentRepository.delete({}),
      this.myListRepository.delete({}),
    ]);
  }
}
