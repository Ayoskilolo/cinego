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
      `Found ${profiles.length} profiles and ${movies.length} movies`,
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

    // Generate interactions for each profile
    for (const profile of profiles) {
      // Each profile watches 5-15 movies
      const numberOfWatchedMovies = faker.number.int({ min: 5, max: 15 });
      const watchedMovies = faker.helpers.arrayElements(
        movies,
        numberOfWatchedMovies,
      );

      // Track which movies this profile has watched for realistic interactions
      const profileWatchedMovies = new Set<string>();

      for (const movie of watchedMovies) {
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
            // 40% chance to review a completed movie
            if (faker.datatype.boolean({ probability: 0.4 })) {
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

            // 25% chance to comment on a completed movie
            if (faker.datatype.boolean({ probability: 0.25 })) {
              const commentContent =
                faker.helpers.arrayElement(commentTemplates);

              const comment: Partial<Comment> = {
                profileId: profile.id,
                movieId: movie.id,
                content: commentContent,
              };

              const commentEntity = this.commentRepository.create(comment);
              await this.commentRepository.save(commentEntity);
            }
          }

          // 60% chance to add any watched movie to their list
          if (faker.datatype.boolean({ probability: 0.6 })) {
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
      const unwatchedMovies = movies.filter(
        (movie) => !profileWatchedMovies.has(movie.id),
      );
      if (unwatchedMovies.length > 0) {
        const numberOfUnwatchedForList = faker.number.int({
          min: 2,
          max: Math.min(8, unwatchedMovies.length),
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
        `Seeded interactions for profile: ${profile.profileName} (${numberOfWatchedMovies} watched, interactions created)`,
      );
    }

    this.logger.log('Successfully seeded user interactions');
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
