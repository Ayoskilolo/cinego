import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { Movie } from './entities/movie.entity';
import { MovieContentType } from './enums/movie-content-type.enum';
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

    const posterChoices = [
      'https://res.cloudinary.com/djelopmav/image/upload/v1767772453/zootopia_two_ver5_uwezay.jpg',
      'https://res.cloudinary.com/djelopmav/image/upload/v1767772911/five_nights_at_freddys_two_ver2_iwyw1a.jpg',
      'https://res.cloudinary.com/djelopmav/image/upload/v1767772926/now_you_see_me_now_you_dont_yvwaer.jpg',
    ];

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

    // Generate and save films
    const numberOfFilms = 40;

    for (let i = 0; i < numberOfFilms; i++) {
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
      const providerTitleId = faker.string.uuid();

      const selectedImage = faker.helpers.arrayElement(posterChoices);
      const movie: Partial<Movie> = {
        title: title,
        providerId: selectedProvider.id,
        providerTitleId: providerTitleId,
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
          poster: selectedImage,
          posterLandscape: selectedImage,
          thumbnail: selectedImage,
        },
        contentType: MovieContentType.FILM,
        mediaKeys: this._generateTestMediaKeys(
          selectedProvider.slug,
          providerTitleId,
        ),
      };

      try {
        const movieEntity = this.movieRepository.create(movie);
        await this.movieRepository.save(movieEntity);
        this.logger.log(`Seeded movie: ${movie.title}`);
      } catch (error) {
        this.logger.error(`Unable to seed movie ${movie.title}`, error);
      }
    }

    this.logger.log(`Successfully seeded ${numberOfFilms} films`);

    // Generate and save series with episodes
    const numberOfSeries = 10;
    for (let s = 0; s < numberOfSeries; s++) {
      const seriesTitle =
        `${faker.word.noun()} ${faker.word.adjective()} Series`.replace(
          /\b\w/g,
          (c) => c.toUpperCase(),
        );
      const year = faker.number.int({ min: 1995, max: 2024 }).toString();
      const selectedProvider = faker.helpers.arrayElement(validProviders);
      const seriesProviderTitleId = faker.string.uuid();

      const seriesSelectedImage = faker.helpers.arrayElement(posterChoices);
      const seriesEntity = this.movieRepository.create({
        title: seriesTitle,
        providerId: selectedProvider.id,
        providerTitleId: seriesProviderTitleId,
        programType: 'TV Show',
        synopsis: faker.lorem.paragraph(3),
        productionYear: year,
        marketRating: faker.helpers.arrayElement(marketRatings),
        isHD: true,
        director: faker.person.fullName(),
        cast: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () =>
          faker.person.fullName(),
        ),
        genres: faker.helpers.arrayElements(
          genres,
          faker.number.int({ min: 1, max: 3 }),
        ),
        languages: faker.helpers.arrayElements(
          languages,
          faker.number.int({ min: 1, max: 2 }),
        ),
        duration: `${faker.number.int({ min: 20, max: 60 })} min`,
        isPremium: faker.datatype.boolean(),
        images: {
          poster: seriesSelectedImage,
          posterLandscape: seriesSelectedImage,
          thumbnail: seriesSelectedImage,
        },
        contentType: MovieContentType.SERIES,
        mediaKeys: {
          trailer: this._generateTestMediaKeys(
            selectedProvider.slug,
            seriesProviderTitleId,
          ).trailer,
        },
      });

      let savedSeries: Movie;
      try {
        savedSeries = await this.movieRepository.save(seriesEntity);
        this.logger.log(`Seeded series: ${seriesTitle}`);
      } catch (error) {
        this.logger.error(`Unable to seed series ${seriesTitle}`, error);
        continue;
      }

      const seasons = faker.number.int({ min: 1, max: 3 });
      for (let season = 1; season <= seasons; season++) {
        const episodesInSeason = faker.number.int({ min: 4, max: 8 });
        for (let ep = 1; ep <= episodesInSeason; ep++) {
          const episodeProviderTitleId = faker.string.uuid();
          const episodeDuration = `${faker.number.int({ min: 20, max: 60 })} min`;
          const episodeSelectedImage =
            faker.helpers.arrayElement(posterChoices);
          const episodeEntity = this.movieRepository.create({
            title: `${seriesTitle} S${season}E${ep}`,
            providerId: selectedProvider.id,
            providerTitleId: episodeProviderTitleId,
            programType: 'TV Episode',
            synopsis: faker.lorem.paragraph(2),
            productionYear: year,
            marketRating: faker.helpers.arrayElement(marketRatings),
            isHD: true,
            director: faker.person.fullName(),
            cast: Array.from(
              { length: faker.number.int({ min: 3, max: 8 }) },
              () => faker.person.fullName(),
            ),
            genres: faker.helpers.arrayElements(
              genres,
              faker.number.int({ min: 1, max: 3 }),
            ),
            languages: faker.helpers.arrayElements(
              languages,
              faker.number.int({ min: 1, max: 2 }),
            ),
            duration: episodeDuration,
            isPremium: savedSeries.isPremium,
            images: {
              poster: episodeSelectedImage,
              posterLandscape: episodeSelectedImage,
              thumbnail: episodeSelectedImage,
            },
            contentType: MovieContentType.EPISODE,
            seriesId: savedSeries.id,
            seasonNumber: season,
            episodeNumber: ep,
            mediaKeys: this._generateTestMediaKeys(
              selectedProvider.slug,
              episodeProviderTitleId,
            ),
          });
          try {
            await this.movieRepository.save(episodeEntity);
            this.logger.log(`Seeded episode: ${seriesTitle} S${season}E${ep}`);
          } catch (error) {
            this.logger.error(
              `Unable to seed episode ${seriesTitle} S${season}E${ep}`,
              error,
            );
          }
        }
      }
    }

    this.logger.log(
      `Successfully seeded ${numberOfSeries} series with episodes`,
    );
  }

  /**
   * Generate test media keys for seeding purposes
   * This uses predefined test keys for consistent testing
   */
  private _generateTestMediaKeys(
    providerSlug: string,
    providerTitleId: string,
  ) {
    // Use predefined test content keys for consistent testing
    const testContent = [
      {
        main: 'fast-6/trailer/variants/fast6_master.m3u8',
        trailer: 'fast-6/trailer/variants/fast6_master.m3u8',
      },
      {
        main: 'simpsons/trailer/variants/simpsons_master.m3u8',
        trailer: 'simpsons/trailer/variants/simpsons_master.m3u8',
      },
      {
        main: 'the-batman/trailer/variants/batman_master.m3u8',
        trailer: 'the-batman/trailer/variants/batman_master.m3u8',
      },
    ];

    // Select a random test key from the predefined set
    const testKeys = faker.helpers.arrayElement(testContent);

    this.logger.debug(`Generated test mediaKeys for ${providerTitleId}:`, {
      providerSlug,
      selectedKeys: testKeys,
    });

    return testKeys;
  }

  drop(): Promise<any> {
    return this.movieRepository.delete({});
  }
}
