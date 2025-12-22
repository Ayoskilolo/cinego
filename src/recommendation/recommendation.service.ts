import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Movie } from '../movie/entities/movie.entity';
import { Review } from '../review/entities/review.entity';
import { MyListEntity } from '../my-list/entities/my-list.entity';
import { Profile } from '../user/entities/profile.entity';
import { ItemSimilarity } from './entities/item-similarity.entity';
import { WatchHistory } from '../user/entities/watch-history.entity';
import { Cron } from '@nestjs/schedule';
import { MyListService } from '../my-list/my-list.service';
import { MovieContentType } from '../movie/enums/movie-content-type.enum';

@Injectable()
export class RecommendationService {
  // How many similar movies to store for each movie (keeps database size manageable)
  private readonly TOP_K_PER_ITEM = 20;

  // How much to weight content-based vs collaborative filtering (50/50 split)
  private readonly CONTENT_WEIGHT = 0.5;

  constructor(
    @InjectRepository(Movie) private movieRepository: Repository<Movie>,
    @InjectRepository(Review) private reviewRepository: Repository<Review>,
    @InjectRepository(WatchHistory)
    private watchHistoryRepository: Repository<WatchHistory>,
    @InjectRepository(MyListEntity)
    private myListRepository: Repository<MyListEntity>,
    @InjectRepository(Profile) private profileRepository: Repository<Profile>,
    @InjectRepository(ItemSimilarity)
    private itemSimilarityRepository: Repository<ItemSimilarity>,
    private myListService: MyListService,
  ) {}

  /**
   * 🔄 CRON JOB: Runs daily at 2:00 AM to rebuild movie similarity matrix
   *
   * This is the "Collaborative Filtering" part - it figures out which movies are similar
   * by analyzing how users rate/watch movies together.
   *
   * Think of it like: "People who liked Movie A also liked Movie B, C, D..."
   */
  @Cron('0 2 * * *') // every day at 02:00
  async precomputeItemSimilarities(): Promise<void> {
    // Get all user ratings and watch completions
    const allUserReviews = await this.reviewRepository.find();
    const allCompletedWatches = await this.watchHistoryRepository.find({
      where: { isCompleted: true },
    });

    /**
     * Build a user-movie rating matrix: userId → { movieId: rating }
     * This tracks what each user thought of each movie they've seen
     */
    const userMovieRatings: Record<string, Record<string, number>> = {};

    // Add explicit ratings (1-5 stars)
    for (const review of allUserReviews) {
      if (review.rating > 0) {
        userMovieRatings[review.profileId] =
          userMovieRatings[review.profileId] || {};
        userMovieRatings[review.profileId][review.movieId] = review.rating;
      }
    }

    // Add implicit ratings (if they finished watching, they probably liked it)
    for (const watch of allCompletedWatches) {
      userMovieRatings[watch.profileId] =
        userMovieRatings[watch.profileId] || {};
      if (!userMovieRatings[watch.profileId][watch.movieId]) {
        userMovieRatings[watch.profileId][watch.movieId] = 1.0; // implicit "liked it"
      }
    }

    /**
     * Create a mapping from movie IDs to array indices (0, 1, 2, ...)
     * This makes the math easier - we can use array positions instead of movie IDs
     */
    const allMovieIds = (
      await this.movieRepository.find({ select: ['id'] })
    ).map((movie) => movie.id);
    const movieIdToIndex: Record<string, number> = {};
    allMovieIds.forEach((movieId, index) => (movieIdToIndex[movieId] = index));

    const totalMovies = allMovieIds.length;
    const totalUsers = Object.keys(userMovieRatings).length;

    /**
     * Create the rating matrix: movieMatrix[movieIndex][userIndex] = rating
     * Each row represents a movie, each column represents a user
     */
    const movieRatingMatrix: number[][] = Array(totalMovies)
      .fill(0)
      .map(() => Array(totalUsers).fill(0));

    /** Fill the matrix with actual ratings */
    Object.entries(userMovieRatings).forEach(
      ([userId, userRatings], userIndex) => {
        Object.entries(userRatings).forEach(([movieId, rating]) => {
          const movieIndex = movieIdToIndex[movieId];
          if (movieIndex !== undefined) {
            movieRatingMatrix[movieIndex][userIndex] = rating;
          }
        });
      },
    );

    /**
     * Calculate cosine similarity between all movie pairs
     * Cosine similarity measures how similar two movies are based on user ratings
     * Higher score = more similar movies
     */
    function calculateCosineSimilarity(
      movieARatings: number[],
      movieBRatings: number[],
    ): number {
      let dotProduct = 0;
      let movieANorm = 0;
      let movieBNorm = 0;

      for (let userIndex = 0; userIndex < movieARatings.length; userIndex++) {
        const ratingA = movieARatings[userIndex];
        const ratingB = movieBRatings[userIndex];

        dotProduct += ratingA * ratingB;
        movieANorm += ratingA * ratingA;
        movieBNorm += ratingB * ratingB;
      }

      // Avoid division by zero
      return movieANorm && movieBNorm
        ? dotProduct / (Math.sqrt(movieANorm) * Math.sqrt(movieBNorm))
        : 0;
    }

    // Clear old similarity data
    await this.itemSimilarityRepository.clear();

    /**
     * For each movie, find its top 20 most similar movies and save them
     * This is the "precomputed recommendations" - we do the heavy math once per day
     */
    for (
      let currentMovieIndex = 0;
      currentMovieIndex < totalMovies;
      currentMovieIndex++
    ) {
      const similarities: { movieId: string; similarityScore: number }[] = [];

      // Compare current movie with every other movie
      for (
        let otherMovieIndex = 0;
        otherMovieIndex < totalMovies;
        otherMovieIndex++
      ) {
        if (currentMovieIndex !== otherMovieIndex) {
          const similarityScore = calculateCosineSimilarity(
            movieRatingMatrix[currentMovieIndex],
            movieRatingMatrix[otherMovieIndex],
          );

          // Only keep meaningful similarities (above 0.001)
          if (similarityScore > 0.001) {
            similarities.push({
              movieId: allMovieIds[otherMovieIndex],
              similarityScore,
            });
          }
        }
      }

      // Sort by similarity score (highest first) and take top 20
      similarities.sort((a, b) => b.similarityScore - a.similarityScore);
      const topSimilarMovies = similarities.slice(0, this.TOP_K_PER_ITEM);

      // Save to database
      const similarityRecords = topSimilarMovies.map((similarity) => {
        const record = new ItemSimilarity();
        record.movieId = allMovieIds[currentMovieIndex];
        record.similarMovieId = similarity.movieId;
        record.score = similarity.similarityScore;
        return record;
      });

      await this.itemSimilarityRepository.save(similarityRecords);
    }
  }

  /**
   * Updates user's taste profile based on what they've watched, rated, and added to their list
   *
   * This is the "Content-Based Filtering" part - it analyzes what genres, actors, etc.
   * the user prefers based on their viewing history.
   *
   * Think of it like: "You like action movies with Tom Cruise, so here are more action movies with Tom Cruise"
   */
  async updateUserProfile(profileId: string): Promise<void> {
    // Get user's viewing history
    const completedWatches = await this.watchHistoryRepository.find({
      where: [
        { profileId, isCompleted: true },
        { profileId, watchProgress: MoreThan(85) }, // Consider 85%+ watched as "liked"
      ],
    });
    const userReviews = await this.reviewRepository.find({
      where: { profileId, rating: MoreThan(0) },
    });
    const userListItems = await this.myListRepository.find({
      where: { profileId },
    });

    /**
     * Calculate how much the user "likes" each movie they've interacted with
     * Different actions have different weights:
     * - Watched/Completed: +0.5 points
     * - Rated: +rating points (1-5 stars)
     * - Added to list: +1.5 points (strongest signal of interest)
     */
    const moviePreferenceScores: Record<string, number> = {};

    completedWatches.forEach((watch) => {
      moviePreferenceScores[watch.movieId] =
        (moviePreferenceScores[watch.movieId] || 0) + 0.5;
    });

    userReviews.forEach((review) => {
      moviePreferenceScores[review.movieId] =
        (moviePreferenceScores[review.movieId] || 0) + review.rating * 1.0;
    });

    userListItems.forEach((listItem) => {
      moviePreferenceScores[listItem.movieId] = Math.max(
        moviePreferenceScores[listItem.movieId] || 0,
        1.5,
      );
    });

    // Get the actual movie details to analyze genres and cast
    const userMovies = await this.movieRepository.find({
      where: { id: In(Object.keys(moviePreferenceScores)) },
    });

    /**
     * Build the user's taste profile: what genres and actors do they prefer?
     * Each genre/actor gets a score based on how much the user liked movies with that feature
     */
    const userTasteProfile: Record<string, number> = {};

    for (const movie of userMovies) {
      const movieScore = moviePreferenceScores[movie.id];

      // Analyze genres: "genre:action" = 15.5 means user really likes action movies
      (movie.genres || []).forEach((genre) => {
        const genreKey = 'genre:' + genre;
        userTasteProfile[genreKey] =
          (userTasteProfile[genreKey] || 0) + movieScore;
      });

      // Analyze cast (top 5 actors only): "cast:Tom Cruise" = 8.2 means user likes Tom Cruise movies
      (movie.cast || []).slice(0, 5).forEach((actor) => {
        const actorKey = 'cast:' + actor;
        userTasteProfile[actorKey] =
          (userTasteProfile[actorKey] || 0) + movieScore * 0.2; // Actors weighted less than genres
      });
    }

    // Save the user's taste profile to their profile
    await this.profileRepository.update(profileId, {
      contentProfileJSON: userTasteProfile as any,
      contentProfileUpdatedAt: new Date(),
    });
  }

  /**
   * MAIN RECOMMENDATION FUNCTION: Returns personalized movie recommendations for a user
   *
   * This combines BOTH recommendation approaches:
   * 1. Content-Based: "You like action movies, here are more action movies"
   * 2. Collaborative: "People like you also liked these movies"
   *
   * Final score = 50% content-based + 50% collaborative filtering
   */
  async getRecommendationsForUser(
    userId: string,
    profileId: string,
    topN = 10,
    contentWeight = 0.5,
  ): Promise<Movie[]> {
    // Validate authentication and authorization
    if (!userId) {
      throw new UnauthorizedException(
        'You must be logged in to get recommendations',
      );
    }

    // Validate parameters
    if (topN < 1 || topN > 50) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }

    if (contentWeight < 0 || contentWeight > 1) {
      throw new BadRequestException(
        'Content weight must be between 0.0 and 1.0',
      );
    }

    // Validate that the profile belongs to the authenticated user
    await this.validateProfileOwnership(userId, profileId);

    // Check if user has an up-to-date taste profile (only update if missing or stale)
    const userProfile = await this.profileRepository.findOne({
      where: { id: profileId },
    });

    const shouldUpdateProfile =
      !userProfile?.contentProfileJSON ||
      !userProfile?.contentProfileUpdatedAt ||
      new Date().getTime() - userProfile.contentProfileUpdatedAt.getTime() >
        24 * 60 * 60 * 1000; // 24 hours

    if (shouldUpdateProfile) {
      await this.updateUserProfile(profileId);
    }

    const { contentProfileJSON: userTasteProfile } =
      await this.profileRepository.findOne({
        where: { id: profileId },
      });

    const allMovies = await this.movieRepository.find();

    // Get precomputed movie similarities for movies the user has interacted with
    const movieSimilarities = await this.itemSimilarityRepository.find({
      where: { movieId: In(Object.keys(userTasteProfile)) },
    });

    /**
     * CONTENT-BASED SCORING: How well does each movie match the user's taste profile?
     *
     * For each movie, check if it has genres/actors the user likes
     * Higher score = better match with user's preferences
     */
    const contentBasedScores: Record<string, number> = {};
    const moviesWithGenres = allMovies.map((movie) => ({
      id: movie.id,
      genres: new Set(movie.genres || []),
    }));

    moviesWithGenres.forEach((movie) => {
      let contentScore = 0;

      // Add up scores for each genre this movie has that the user likes
      for (const genre of movie.genres) {
        const genreKey = 'genre:' + genre;
        contentScore += userTasteProfile[genreKey] || 0;
      }

      if (contentScore > 0) {
        contentBasedScores[movie.id] = contentScore;
      }
    });

    /**
     * COLLABORATIVE FILTERING SCORING: What do similar users recommend?
     *
     * Uses the precomputed movie similarities to predict ratings
     * "If you liked Movie A, and Movie A is similar to Movie B, you might like Movie B"
     */
    const collaborativeFilteringScores: Record<string, number> = {};

    // Get user's ratings and watched movies
    const userRatings = await this.reviewRepository.find({
      where: { profileId },
    });
    const userWatchedMovies = await this.watchHistoryRepository.find({
      where: [
        { profileId, isCompleted: true },
        { profileId, watchProgress: MoreThan(85) },
      ],
    });

    // Create a set of movies the user has already seen (we don't want to recommend these)
    const alreadySeenMovies = new Set<string>([
      ...userRatings.map((rating) => rating.movieId),
      ...userWatchedMovies.map((watch) => watch.movieId),
    ]);

    // Create a map of user's ratings for each movie
    const userRatingMap = {
      ...Object.fromEntries(
        userRatings.map((rating) => [rating.movieId, rating.rating]),
      ),
      ...Object.fromEntries(
        userWatchedMovies.map((watch) => [watch.movieId, 1]),
      ), // Watched = implicit rating of 1
    };

    /**
     * Calculate collaborative filtering scores:
     * For each movie the user has rated/watched, look at similar movies
     * and add weighted scores based on similarity
     */
    movieSimilarities.forEach((similarity) => {
      const sourceMovieId = similarity.movieId;
      const userRatingForSourceMovie = userRatingMap[sourceMovieId] || 0;

      if (userRatingForSourceMovie > 0) {
        const targetMovieId = similarity.similarMovieId;

        // Don't recommend movies the user has already seen
        if (!alreadySeenMovies.has(targetMovieId)) {
          const weightedScore = similarity.score * userRatingForSourceMovie;
          collaborativeFilteringScores[targetMovieId] =
            (collaborativeFilteringScores[targetMovieId] || 0) + weightedScore;
        }
      }
    });

    /**
     * Normalize collaborative filtering scores by dividing by the sum of similarities
     * This prevents movies with many similar movies from getting unfairly high scores
     */
    const normalizationFactors: Record<string, number> = {};
    movieSimilarities.forEach((similarity) => {
      const sourceMovieId = similarity.movieId;
      if (userRatingMap[sourceMovieId]) {
        const targetMovieId = similarity.similarMovieId;
        normalizationFactors[targetMovieId] =
          (normalizationFactors[targetMovieId] || 0) + similarity.score;
      }
    });

    Object.keys(collaborativeFilteringScores).forEach((movieId) => {
      collaborativeFilteringScores[movieId] /=
        normalizationFactors[movieId] || 1;
    });

    /**
     * COMBINE BOTH APPROACHES: Final recommendation score
     *
     * Final Score = (50% × Content Score) + (50% × Collaborative Score)
     *
     * This gives you the best of both worlds:
     * - Content-based: More of what you already know you like
     * - Collaborative: New discoveries based on similar users
     */
    const finalRecommendationScores: Record<string, number> = {};

    allMovies.forEach((movie) => {
      // Don't recommend movies the user has already seen
      if (!alreadySeenMovies.has(movie.id)) {
        const contentScore = contentBasedScores[movie.id] || 0;
        const collaborativeScore = collaborativeFilteringScores[movie.id] || 0;

        finalRecommendationScores[movie.id] =
          contentWeight * contentScore +
          (1 - contentWeight) * collaborativeScore;
      }
    });

    // Sort by final score (highest first) and return top N recommendations
    const topRecommendedMovieIds = Object.entries(finalRecommendationScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([movieId]) => movieId);

    const recommendedMovies = await this.movieRepository.find({
      where: { id: In(topRecommendedMovieIds) },
      order: { id: 'DESC' },
    });

    // Enrich movies with MyList data to match the format of other movie endpoints
    return await this.enrichMoviesWithMyListData(recommendedMovies, profileId);
  }

  /**
   * Generate content-based similarities when collaborative filtering data is sparse
   * This ensures every movie has some related movies even with limited user data
   */
  private async generateContentBasedSimilarities(): Promise<void> {
    const allMovies = await this.movieRepository.find();
    const contentBasedSimilarities: ItemSimilarity[] = [];

    for (const movie of allMovies) {
      if (!movie.genres || movie.genres.length === 0) continue;

      // Find movies with similar genres
      const similarGenreMovies = allMovies.filter(
        (otherMovie) =>
          otherMovie.id !== movie.id &&
          otherMovie.genres &&
          otherMovie.genres.some((genre) => movie.genres.includes(genre)),
      );

      // Calculate genre similarity scores
      const genreSimilarities = similarGenreMovies.map((otherMovie) => {
        const commonGenres = movie.genres.filter((genre) =>
          otherMovie.genres.includes(genre),
        );
        const totalGenres = new Set([...movie.genres, ...otherMovie.genres])
          .size;
        const similarityScore = commonGenres.length / totalGenres; // Jaccard similarity

        return {
          movieId: movie.id,
          similarMovieId: otherMovie.id,
          score: similarityScore,
        };
      });

      // Sort by similarity and take top 10
      genreSimilarities
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .forEach((similarity) => {
          const record = new ItemSimilarity();
          record.movieId = similarity.movieId;
          record.similarMovieId = similarity.similarMovieId;
          record.score = similarity.score;
          contentBasedSimilarities.push(record);
        });
    }

    // Save content-based similarities
    if (contentBasedSimilarities.length > 0) {
      await this.itemSimilarityRepository.save(contentBasedSimilarities);
    }
  }

  /**
   * Manually trigger the similarity computation (useful for development/testing)
   * This bypasses the cron schedule and runs immediately
   */
  async triggerSimilarityComputation() {
    await this.precomputeItemSimilarities();

    const totalSimilarities = await this.itemSimilarityRepository.count();
    const totalMovies = await this.movieRepository.count();

    return {
      message: 'Similarity computation completed successfully',
      data: {
        processedMovies: totalMovies,
        totalSimilarities,
      },
    };
  }

  /**
   * Validate that a profile belongs to the specified user
   * This is a security check to prevent users from accessing other users' data
   */
  async validateProfileOwnership(
    userId: string,
    profileId: string,
  ): Promise<Profile> {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId, userId },
    });

    if (!profile) {
      throw new UnauthorizedException(
        'Profile not found or does not belong to you',
      );
    }

    return profile;
  }

  /**
   * Simple movie-to-movie recommendations: "If you liked this movie, you might like these"
   *
   * This uses the precomputed similarities to find related movies
   * Much simpler than user-based recommendations - just looks up similar movies
   */
  async getRelatedMovies(
    movieId: string,
    topN = 5,
  ): Promise<Movie[] | { message: string; data: Movie[] }> {
    // Validate parameters
    if (topN < 1 || topN > 20) {
      throw new BadRequestException('Limit must be between 1 and 20');
    }

    const similarMovies = await this.itemSimilarityRepository.find({
      where: { movieId },
      order: { score: 'DESC' },
      take: topN,
    });

    // If no similarities found, try content-based fallback
    if (similarMovies.length === 0) {
      // Get the source movie to find similar genres
      const sourceMovie = await this.movieRepository.findOne({
        where: { id: movieId },
      });

      if (sourceMovie && sourceMovie.genres && sourceMovie.genres.length > 0) {
        // Find movies with similar genres
        const genreBasedMovies = await this.movieRepository
          .createQueryBuilder('movie')
          .where('movie.id != :movieId', { movieId })
          .andWhere('movie.genres && ARRAY[:...genres]', {
            genres: sourceMovie.genres,
          })
          .andWhere('movie.contentType != :episode', {
            episode: MovieContentType.EPISODE,
          })
          .orderBy('RANDOM()')
          .limit(topN)
          .getMany();

        if (genreBasedMovies.length > 0) {
          return {
            message:
              'No collaborative similarities found. Here are movies with similar genres.',
            data: await this.enrichMoviesWithMyListData(genreBasedMovies, null),
          };
        }
      }

      // Final fallback: random movies
      const fallbackMovies = await this.movieRepository
        .createQueryBuilder('movie')
        .where('movie.id != :movieId', { movieId })
        .andWhere('movie.contentType != :episode', {
          episode: MovieContentType.EPISODE,
        })
        .orderBy('RANDOM()')
        .limit(topN)
        .getMany();

      return {
        message: 'No similar movies found. Here are some random movies.',
        data: await this.enrichMoviesWithMyListData(fallbackMovies, null),
      };
    }

    // If we have very few similarities, supplement with content-based
    if (similarMovies.length < 3) {
      const sourceMovie = await this.movieRepository.findOne({
        where: { id: movieId },
      });

      if (sourceMovie && sourceMovie.genres && sourceMovie.genres.length > 0) {
        // Get additional genre-based movies
        const additionalGenreMovies = await this.movieRepository
          .createQueryBuilder('movie')
          .where('movie.id != :movieId', { movieId })
          .andWhere('movie.genres && ARRAY[:...genres]', {
            genres: sourceMovie.genres,
          })
          .andWhere('movie.id NOT IN (:...existingIds)', {
            existingIds: similarMovies.map((s) => s.similarMovieId),
          })
          .andWhere('movie.contentType != :episode', {
            episode: MovieContentType.EPISODE,
          })
          .orderBy('RANDOM()')
          .limit(topN - similarMovies.length)
          .getMany();

        // Combine collaborative and content-based results
        const allRelatedMovies = await this.movieRepository.find({
          where: {
            id: In([
              ...similarMovies.map((s) => s.similarMovieId),
              ...additionalGenreMovies.map((m) => m.id),
            ]),
          },
        });

        return {
          message:
            "Mixed collaborative and content-based recommendations. As user interaction with data is very sparse and can't meet threshold, we're using content-based recommendations.",
          data: await this.enrichMoviesWithMyListData(allRelatedMovies, null),
        };
      }
    }

    const relatedMoviesRaw = await this.movieRepository.find({
      where: {
        id: In(similarMovies.map((similarity) => similarity.similarMovieId)),
      },
    });
    const relatedMovies = relatedMoviesRaw.filter(
      (m) => m.contentType !== MovieContentType.EPISODE,
    );

    // Enrich movies with MyList data to match the format of other movie endpoints
    return {
      message: 'Similar movies found.',
      data: await this.enrichMoviesWithMyListData(relatedMovies, null),
    }; // No profileId for related movies
  }

  /**
   * Enrich movies with MyList data to match the format of other movie endpoints
   * This ensures consistency across the API
   */
  private async enrichMoviesWithMyListData(
    movies: Movie[],
    profileId: string | null,
  ): Promise<Movie[]> {
    if (movies.length === 0) return movies;

    const movieIds = movies.map((movie) => movie.id);

    // Get MyList counts and user checks in parallel
    const [counts, userChecks] = await Promise.all([
      this.getMyListCountsBatch(movieIds),
      profileId ? this.getUserMyListChecksBatch(profileId, movieIds) : {},
    ]);

    // Populate episodes for any series present in the batch (empty for others)
    let episodesBySeriesId: Record<string, Movie[]> = {};
    if (movieIds.length) {
      const episodeRows = await this.movieRepository
        .createQueryBuilder('m')
        .where('m.seriesId IN (:...seriesIds)', { seriesIds: movieIds })
        .select([
          'm.id',
          'm.title',
          'm.providerTitleId',
          'm.programType',
          'm.contentType',
          'm.synopsis',
          'm.productionYear',
          'm.marketRating',
          'm.isHD',
          'm.director',
          'm.cast',
          'm.genres',
          'm.languages',
          'm.duration',
          'm.images',
          'm.dateCreated',
          'm.isPremium',
          'm.seasonNumber',
          'm.episodeNumber',
          'm.seriesId',
        ])
        .orderBy('COALESCE(m.seasonNumber, 0)', 'ASC')
        .addOrderBy('COALESCE(m.episodeNumber, 0)', 'ASC')
        .addOrderBy('m.dateCreated', 'ASC')
        .getMany();

      episodesBySeriesId = episodeRows.reduce(
        (acc, ep) => {
          const sid = (ep as any).seriesId as string;
          if (!sid) return acc;
          (acc[sid] = acc[sid] || []).push(ep);
          return acc;
        },
        {} as Record<string, Movie[]>,
      );
    }

    // Enrich each movie with the batch data (mutate into Movie shape)
    return movies.map((movie) => {
      const enriched = Object.assign(movie, {
        episodes: episodesBySeriesId[movie.id] || [],
        myListCount: counts[movie.id] || 0,
        isInMyList: profileId ? userChecks[movie.id] || false : undefined,
      });
      return enriched as Movie;
    });
  }

  /**
   * Get MyList counts for multiple movies in a single query
   */
  private async getMyListCountsBatch(
    movieIds: string[],
  ): Promise<Record<string, number>> {
    if (movieIds.length === 0) return {};

    const counts = await this.myListRepository
      .createQueryBuilder('myList')
      .select('myList.movieId', 'movieId')
      .addSelect('COUNT(*)', 'count')
      .where('myList.movieId IN (:...movieIds)', { movieIds })
      .groupBy('myList.movieId')
      .getRawMany();

    return counts.reduce(
      (acc, item) => {
        acc[item.movieId] = parseInt(item.count);
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Check if movies are in the user's MyList for multiple movies in a single query
   */
  private async getUserMyListChecksBatch(
    profileId: string,
    movieIds: string[],
  ): Promise<Record<string, boolean>> {
    if (movieIds.length === 0) return {};

    const minimalMovieRows = await this.movieRepository.find({
      where: movieIds.map((id) => ({ id })),
      select: ['id', 'contentType', 'seriesId'],
    });

    const idsToCheckSet = new Set<string>();
    minimalMovieRows.forEach((movieRow) => {
      idsToCheckSet.add(movieRow.id);
      if (
        movieRow.contentType === MovieContentType.EPISODE &&
        movieRow.seriesId
      ) {
        idsToCheckSet.add(movieRow.seriesId);
      }
    });

    const presentIds = await this.myListService.getMyListItemsBatch(
      profileId,
      Array.from(idsToCheckSet),
    );

    const inListChecks: Record<string, boolean> = {};
    minimalMovieRows.forEach((movieRow) => {
      const isSelfInList = presentIds.includes(movieRow.id);
      const isParentSeriesInList = movieRow.seriesId
        ? presentIds.includes(movieRow.seriesId)
        : false;
      inListChecks[movieRow.id] = isSelfInList || isParentSeriesInList;
    });

    movieIds.forEach((id) => {
      if (!(id in inListChecks)) inListChecks[id] = false;
    });

    return inListChecks;
  }
}
