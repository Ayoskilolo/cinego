import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { Movie } from './entities/movie.entity';
import { ProvidersEntity } from '../providers/entities/providers.entity';
import { faker } from '@faker-js/faker';

@Injectable()
export class MovieSeeder implements Seeder {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    @InjectRepository(ProvidersEntity)
    private readonly providersRepository: Repository<ProvidersEntity>,
  ) {}
  private readonly logger = new Logger(MovieSeeder.name);

  async seed(): Promise<any> {
    const isAlreadySeeded = !!((await this.movieRepository.count()) > 1);

    if (isAlreadySeeded) {
      this.logger.log('Movies already seeded, skipping...');
      return;
    }

    // Get existing providers to use their IDs
    const providers = await this.providersRepository.find();
    if (providers.length === 0) {
      this.logger.error(
        'No providers found. Please run the providers seeder first.',
      );
      return;
    }

    // Validate that all providers have valid IDs
    const validProviders = providers.filter((p) => p.id && p.id !== '');
    if (validProviders.length === 0) {
      this.logger.error(
        'No valid provider IDs found. Please check the providers seeder.',
      );
      return;
    }

    // Movie titles with realistic patterns
    const movieTitles = [
      'The Last Sunset',
      'Midnight Dreams',
      'Echoes of Tomorrow',
      'The Silent Storm',
      'Beyond the Horizon',
      'Whispers in the Dark',
      'The Forgotten Path',
      'Shadows of Yesterday',
      'The Golden Hour',
      'Rivers of Time',
      'The Hidden Truth',
      'Starlight Serenade',
      'The Broken Mirror',
      'Winds of Change',
      'The Lost Kingdom',
      'Eternal Flame',
      'The Secret Garden',
      'Moonlit Memories',
      'The Final Chapter',
      'Dancing with Shadows',
      'The Crimson Rose',
      "Ocean's Heart",
      "The Winter's Tale",
      'Fire and Ice',
      'The Last Dance',
      "Mountain's Call",
      'The Desert Wind',
      'City of Dreams',
      'The Ancient Scroll',
      'Thunder and Lightning',
    ];

    // Realistic genres (lowercase to match provider data)
    const genres = [
      'action',
      'adventure',
      'comedy',
      'drama',
      'horror',
      'romance',
      'sci-fi',
      'thriller',
      'mystery',
      'fantasy',
      'documentary',
      'animation',
      'crime',
      'war',
      'western',
      'musical',
      'biography',
      'history',
    ];

    // Realistic languages
    const languages = [
      'English',
      'Spanish',
      'French',
      'German',
      'Italian',
      'Portuguese',
      'Russian',
      'Japanese',
      'Korean',
      'Chinese',
    ];

    // Realistic market ratings
    const marketRatings = [
      'G',
      'PG',
      'PG-13',
      'R',
      'NC-17',
      'TV-Y',
      'TV-Y7',
      'TV-G',
      'TV-PG',
      'TV-14',
      'TV-MA',
    ];

    // Realistic program types
    const programTypes = [
      'Movie',
      'TV Show',
      'Documentary',
      'Special',
      'Mini-Series',
    ];

    // Generate and save movies
    const numberOfMovies = 50; // Generate 50 movies

    for (let i = 0; i < numberOfMovies; i++) {
      const title = faker.helpers.arrayElement(movieTitles);
      const year = faker.number.int({ min: 1990, max: 2024 }).toString();
      const duration = `${faker.number.int({ min: 80, max: 180 })} min`;

      // Generate realistic cast (3-8 actors)
      const castSize = faker.number.int({ min: 3, max: 8 });
      const cast = Array.from({ length: castSize }, () =>
        faker.person.fullName(),
      );

      // Generate genres (1-3 genres per movie)
      const genreCount = faker.number.int({ min: 1, max: 3 });
      const movieGenres = faker.helpers.arrayElements(genres, genreCount);

      // Generate languages (1-2 languages per movie)
      const languageCount = faker.number.int({ min: 1, max: 2 });
      const movieLanguages = faker.helpers.arrayElements(
        languages,
        languageCount,
      );

      const selectedProvider = faker.helpers.arrayElement(validProviders);

      const movie: Partial<Movie> = {
        title: title,
        s3ObjectKey: `movies/${faker.string.alphanumeric(10)}.mp4`,
        providerId: selectedProvider.id,
        providerTitleId: faker.string.uuid(),
        programType: faker.helpers.arrayElement(programTypes),
        synopsis: faker.lorem.paragraph(3),
        productionYear: year,
        marketRating: faker.helpers.arrayElement(marketRatings),
        isHD: faker.datatype.boolean(),
        director: faker.person.fullName(),
        cast: cast,
        genres: movieGenres,
        languages: movieLanguages,
        duration: duration,
        isPremium: faker.datatype.boolean(),
        images: {
          poster: `https://picsum.photos/300/450?random=${i}`,
          posterLandscape: `https://picsum.photos/800/450?random=${i + 1000}`,
          thumbnail: `https://picsum.photos/200/150?random=${i + 2000}`,
        },
      };

      try {
        const movieEntity = this.movieRepository.create(movie);
        await this.movieRepository.save(movieEntity);
        this.logger.log(`Seeded movie: ${movie.title}`);
      } catch (error) {
        this.logger.error(`Unable to seed movie ${movie.title}`, error);
      }
    }

    this.logger.log(`Successfully seeded ${numberOfMovies} movies`);
  }

  drop(): Promise<any> {
    return this.movieRepository.delete({});
  }
}
