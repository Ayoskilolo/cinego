/**
 * One-off script: seed movies (if not already seeded) + interactions for a
 * specific user.  Does NOT truncate anything.
 *
 * Usage:
 *   pnpm build && node dist/src/seed-for-user.js
 *
 * Environment variables (optional overrides):
 *   TARGET_EMAIL   – defaults to johann.romain@minafter.com
 *   DATA_DENSITY   – 'sparse' (default) | 'dense'
 */
import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import config from './config';

// Entities
import { User } from './user/entities/user.entity';
import { Profile } from './user/entities/profile.entity';
import { Movie } from './movie/entities/movie.entity';
import { ProvidersEntity } from './providers/entities/providers.entity';
import { PaymentPartner } from './payment/entities/payment-partner.entity';
import { SessionEntity } from './auth/entities/session.entity';
import { Transaction } from './transactions/entities/transaction.entity';
import { WatchHistory } from './user/entities/watch-history.entity';
import { MyListEntity } from './my-list/entities/my-list.entity';
import { Comment } from './comment/entities/comment.entity';
import { Review } from './review/entities/review.entity';
import { Blog } from './blogs/entity/blog.entity';
import { BlogComment } from './blogs/entity/blog-comment.entity';
import { MovieNews } from './movie-news/entity/movie-news.entity';
import { MovieContentType } from './movie/enums/movie-content-type.enum';

// Seeders we reuse for content seeding
import { ProvidersSeeder } from './providers/providers.seeder';
import { MovieSeeder } from './movie/movie.seeder';
import { BlogSeeder } from './blogs/blogs.seeder';
import { PaymentPartnerSeeder } from './payment/payment.method.seeder';

import { faker } from '@faker-js/faker';

const logger = new Logger('SeedForUser');

@Module({
  imports: [
    ConfigModule.forRoot({ load: config }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => cs.get('database'),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      User,
      Profile,
      PaymentPartner,
      Movie,
      Transaction,
      ProvidersEntity,
      SessionEntity,
      WatchHistory,
      MyListEntity,
      Comment,
      Review,
      Blog,
      BlogComment,
      MovieNews,
    ]),
  ],
  providers: [ProvidersSeeder, MovieSeeder, BlogSeeder, PaymentPartnerSeeder],
})
class SeedForUserModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SeedForUserModule, {
    logger: ['log', 'error', 'warn'],
  });

  const targetEmail =
    process.env.TARGET_EMAIL || 'johann.romain@minafter.com';

  // ── 1. Seed content (idempotent – skips if already present) ──────────
  logger.log('Ensuring content is seeded (providers, movies, blogs)…');

  const providerSeeder = app.get(ProvidersSeeder);
  const movieSeeder = app.get(MovieSeeder);
  const blogSeeder = app.get(BlogSeeder);
  const paymentSeeder = app.get(PaymentPartnerSeeder);

  await paymentSeeder.seed();
  await providerSeeder.seed();
  await movieSeeder.seed();
  await blogSeeder.seed();

  logger.log('Content seeding done (or skipped if already present).');

  // ── 2. Look up the target user + profiles ────────────────────────────
  const userRepo = app.get<Repository<User>>('UserRepository');
  const profileRepo = app.get<Repository<Profile>>('ProfileRepository');
  const movieRepo = app.get<Repository<Movie>>('MovieRepository');
  const blogRepo = app.get<Repository<Blog>>('BlogRepository');
  const watchHistoryRepo = app.get<Repository<WatchHistory>>(
    'WatchHistoryRepository',
  );
  const reviewRepo = app.get<Repository<Review>>('ReviewRepository');
  const commentRepo = app.get<Repository<Comment>>('CommentRepository');
  const blogCommentRepo = app.get<Repository<BlogComment>>(
    'BlogCommentRepository',
  );
  const myListRepo = app.get<Repository<MyListEntity>>(
    'MyListEntityRepository',
  );

  const user = await userRepo.findOne({ where: { email: targetEmail } });
  if (!user) {
    logger.error(`User with email "${targetEmail}" not found. Aborting.`);
    await app.close();
    process.exit(1);
  }

  const profiles = await profileRepo.find({ where: { userId: user.id } });
  if (profiles.length === 0) {
    logger.error(`No profiles found for user ${targetEmail}. Aborting.`);
    await app.close();
    process.exit(1);
  }

  logger.log(
    `Found user ${user.firstName} ${user.lastName} with ${profiles.length} profile(s).`,
  );

  // ── 3. Load movies & blogs ───────────────────────────────────────────
  const movies = await movieRepo.find({
    select: { id: true, contentType: true, seriesId: true, genres: true },
  });
  const blogs = await blogRepo.find({ select: { id: true, title: true } });

  if (movies.length === 0) {
    logger.error('No movies in the database. Something went wrong.');
    await app.close();
    process.exit(1);
  }

  logger.log(`Loaded ${movies.length} movies and ${blogs.length} blogs.`);

  // ── 4. Seed interactions for each profile ────────────────────────────
  const density = process.env.DATA_DENSITY || 'dense';
  const cfg =
    density === 'dense'
      ? {
          watchedMoviesMin: 25,
          watchedMoviesMax: 40,
          reviewProbability: 0.85,
          commentProbability: 0.7,
          myListProbability: 0.9,
          futureWatchingMin: 8,
          futureWatchingMax: 20,
          blogCommentProbability: 0.6,
          blogsToCommentMin: 3,
          blogsToCommentMax: 8,
        }
      : {
          watchedMoviesMin: 5,
          watchedMoviesMax: 15,
          reviewProbability: 0.4,
          commentProbability: 0.25,
          myListProbability: 0.6,
          futureWatchingMin: 2,
          futureWatchingMax: 8,
          blogCommentProbability: 0.2,
          blogsToCommentMin: 1,
          blogsToCommentMax: 3,
        };

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
  ];

  const blogCommentTemplates = [
    'Great article! Very informative and well-written.',
    'Thanks for sharing this. I learned a lot from reading it.',
    'I completely agree with your points. Well said!',
    'This is exactly what I was looking for. Thank you!',
    'Interesting perspective. I never thought about it this way.',
    'Love the insights in this post. Keep up the great work!',
  ];

  for (const profile of profiles) {
    logger.log(`Seeding interactions for profile: ${profile.profileName}…`);

    const numberOfWatchedMovies = faker.number.int({
      min: cfg.watchedMoviesMin,
      max: Math.min(cfg.watchedMoviesMax, movies.length),
    });
    const moviesToWatch = faker.helpers.arrayElements(
      movies,
      numberOfWatchedMovies,
    );

    const profileWatchedMovies = new Set<string>();
    const watchHistoryRows: DeepPartial<WatchHistory>[] = [];
    const reviewRows: DeepPartial<Review>[] = [];
    const reviewedMovieIds = new Set<string>();
    const commentRows: DeepPartial<Comment>[] = [];
    const blogCommentRows: DeepPartial<BlogComment>[] = [];
    const myListRows: DeepPartial<MyListEntity>[] = [];
    const myListKeySet = new Set<string>();

    for (const movie of moviesToWatch) {
      if (movie.contentType !== MovieContentType.SERIES) {
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
            faker.datatype.boolean({ probability: cfg.reviewProbability }) &&
            !reviewedMovieIds.has(movie.id)
          ) {
            const rating = faker.helpers.weightedArrayElement([
              { value: 1, weight: 5 },
              { value: 2, weight: 10 },
              { value: 3, weight: 25 },
              { value: 4, weight: 40 },
              { value: 5, weight: 20 },
            ]);
            reviewRows.push({ profileId: profile.id, movieId: movie.id, rating });
            reviewedMovieIds.add(movie.id);
          }

          if (faker.datatype.boolean({ probability: cfg.commentProbability })) {
            commentRows.push({
              profileId: profile.id,
              movieId: movie.id,
              content: faker.helpers.arrayElement(commentTemplates),
            });
          }
        }
      } else {
        profileWatchedMovies.add(movie.id);
      }

      if (faker.datatype.boolean({ probability: cfg.myListProbability })) {
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

    // Future watchlist
    const unwatchedMovies = movies.filter(
      (m) => !profileWatchedMovies.has(m.id),
    );
    if (unwatchedMovies.length > 0) {
      const n = faker.number.int({
        min: cfg.futureWatchingMin,
        max: Math.min(cfg.futureWatchingMax, unwatchedMovies.length),
      });
      for (const movie of faker.helpers.arrayElements(unwatchedMovies, n)) {
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

    // Blog comments
    if (
      blogs.length > 0 &&
      faker.datatype.boolean({ probability: cfg.blogCommentProbability })
    ) {
      const n = faker.number.int({
        min: cfg.blogsToCommentMin,
        max: Math.min(cfg.blogsToCommentMax, blogs.length),
      });
      for (const blog of faker.helpers.arrayElements(blogs, n)) {
        blogCommentRows.push({
          profileId: profile.id,
          blogId: blog.id,
          content: faker.helpers.arrayElement(blogCommentTemplates),
        });
      }
    }

    // Insert everything in a transaction
    await watchHistoryRepo.manager.transaction(async (em) => {
      const wh = em.getRepository(WatchHistory);
      const rv = em.getRepository(Review);
      const cm = em.getRepository(Comment);
      const bc = em.getRepository(BlogComment);
      const ml = em.getRepository(MyListEntity);

      if (watchHistoryRows.length) {
        await wh
          .createQueryBuilder()
          .insert()
          .values(watchHistoryRows)
          .execute();
      }
      if (reviewRows.length) {
        await rv
          .createQueryBuilder()
          .insert()
          .values(reviewRows)
          .onConflict('("profileId","movieId") DO NOTHING')
          .execute();
      }
      if (commentRows.length) {
        await cm.createQueryBuilder().insert().values(commentRows).execute();
      }
      if (blogCommentRows.length) {
        await bc
          .createQueryBuilder()
          .insert()
          .values(blogCommentRows)
          .execute();
      }
      if (myListRows.length) {
        await ml
          .createQueryBuilder()
          .insert()
          .values(myListRows)
          .onConflict('("profileId","movieId") DO NOTHING')
          .execute();
      }
    });

    logger.log(
      `  ✓ ${profile.profileName}: ${watchHistoryRows.length} watch history, ` +
        `${reviewRows.length} reviews, ${commentRows.length} comments, ` +
        `${myListRows.length} my-list, ${blogCommentRows.length} blog comments`,
    );
  }

  logger.log('All done!');
  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  logger.error('Seeding failed:', err);
  process.exit(1);
});
