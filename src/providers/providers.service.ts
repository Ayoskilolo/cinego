import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProvidersEntity } from './entities/providers.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import {
  PaginateQuery,
  paginate,
  PaginateConfig,
  FilterOperator,
} from 'nestjs-paginate';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ProvidersEntity)
    private readonly providersRepository: Repository<ProvidersEntity>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}
  private readonly logger = new Logger(ProvidersService.name);

  async getActiveProviders() {
    const providers = await this.providersRepository.find({
      where: { isActive: true },
    });
    if (!providers.length) {
      this.logger.error('No active providers found');
      throw new InternalServerErrorException('No active providers found');
    }
    return providers;
  }

  async findOne(id: string) {
    const provider = await this.providersRepository.findOne({
      where: { id },
    });
    return provider;
  }

  async getMoviesFromProvider(provider: ProvidersEntity) {
    let movies = [];

    try {
      if (provider.slug === 'allrites') {
        const response = await this._fetchAllritesMetadata(provider.baseUrl, {
          month: 'January',
          year: '2025',
        });

        movies = this._extractAllritesMoviesMetadata(response).map((movie) => {
          // Placeholder assignment of media keys using test keys from seeder
          // const s3Keys = this._getMovieS3Key(
          //   movie.providerTitleId,
          //   provider.slug,
          // );
          // this.logger.debug(
          //   `Generated S3 keys for movie ${movie.providerTitleId}:`,
          //   {
          //     main: s3Keys.main,
          //     trailer: s3Keys.trailer,
          //   },
          // );

          const testKeys = this._getRandomTestMediaKeys();
          this.logger.debug(
            `Assigned placeholder mediaKeys for movie ${movie.providerTitleId}:`,
            testKeys,
          );

          return {
            ...movie,
            providerId: provider.id,
            mediaKeys: testKeys,
          };
        });
      } else {
        this.logger.warn(`Provider ${provider.slug} is not yet implemented`);
        return [];
      }
    } catch (error) {
      this.logger.error(
        `Error fetching movies from provider ${provider.slug}:`,
        error,
      );
      throw new InternalServerErrorException(
        `Failed to fetch movies from provider ${provider.name}: ${error.message}`,
      );
    }

    return movies;
  }

  // Get presigned url from s3 bucket
  // The path how allrites stores the movies is like this:
  // allrites_movie_id/main/play-allrites_movie_id.m3u8
  // allrites_movie_id/trailer/play-allrites_movie_id.m3u8

  private _getMovieS3Key(providerTitleId: string, slug: string) {
    let keys;

    if (slug === 'allrites') {
      keys = {
        main: `${providerTitleId}/main/play-${providerTitleId}.m3u8`,
        trailer: `${providerTitleId}/trailer/play-${providerTitleId}.m3u8`,
      };
    } else {
      // Default case for unknown providers
      this.logger.warn(
        `Unknown provider slug: ${slug}, using default S3 key format`,
      );
      keys = {
        main: `${providerTitleId}/main/play-${providerTitleId}.m3u8`,
        trailer: `${providerTitleId}/trailer/play-${providerTitleId}.m3u8`,
      };
    }

    return keys;
  }

  private async _fetchAllritesMetadata(
    baseUrl: string,
    options: { month?: string; year?: string } = {},
  ) {
    const { month = undefined, year = undefined } = options;
    let allMovies = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      // Manually construct query parameters
      let queryParams = '';

      if (month && year) {
        queryParams += `month=${encodeURIComponent(`${month} ${year}`)}`;
      }

      queryParams += `&type=json&page=${page}`;

      const url = `${baseUrl}/metadata?${queryParams}`;

      try {
        const response = await firstValueFrom(
          this.httpService.get(url, {
            headers: {
              'api-token': `${this.configService.get('ALLRITES_API_KEY')}`,
            },
          }),
        );

        const movies = response.data.data.original.data.items || [];
        allMovies = allMovies.concat(movies);

        // Check if there are more pages
        const totalRecords = response.data.data.original.data.totalRecords;
        const itemsPerPage = response.data.data.original.data.itemsPerPage;
        hasMorePages = page * itemsPerPage < totalRecords;

        page++;
      } catch (error) {
        this.logger.error(
          'Error fetching metadata:' + (error.response?.data || error.message),
        );
        throw new Error('Failed to fetch metadata');
      }
    }

    return allMovies;
  }

  private _extractAllritesMoviesMetadata(movies: any[]) {
    return movies.map((movie: any) => {
      const director = movie.director?.meta_value || '';

      // Map credits to get the list of cast names
      const cast = Array.isArray(movie.credits)
        ? movie.credits.map((credit: any) => credit.name)
        : [];

      // Filter out any null languages
      const languages = Array.isArray(movie.languages)
        ? movie.languages.filter((lang: any) => lang !== null)
        : [];

      // Find images for both poster types
      const posterImage = movie.mediaGroup?.images?.find(
        (img: any) => img.type === 'poster',
      );
      const posterLandscapeImage = movie.mediaGroup?.images?.find(
        (img: any) => img.type === 'poster_landscape',
      );

      return {
        providerTitleId: movie.titleID,
        title: movie.primaryTitle,
        programType: movie.programType,
        synopsis: movie.synopsis,
        productionYear: movie.productionYear,
        marketRating: movie.marketRating,
        isHD: movie.isHD === 'True', // Convert string "True" to boolean true
        director: director,
        cast: cast,
        genres: (movie.genre || []).map((genre: string) => genre.toLowerCase()),
        languages: languages,
        duration: movie.mediaGroup?.duration || '',
        images: {
          poster: posterImage ? posterImage.path : '',
          posterLandscape: posterLandscapeImage
            ? posterLandscapeImage.path
            : '',
          thumbnail: posterImage
            ? this._generateAllritesThumbnail(posterImage.path)
            : posterLandscapeImage
              ? this._generateAllritesThumbnail(posterLandscapeImage.path)
              : '',
        },
      };
    });
  }

  private _generateAllritesThumbnail(imageUrl: string): string {
    if (!imageUrl) return '';

    const cloudinaryBase = 'https://res.cloudinary.com/allrites/image/upload/';

    if (!imageUrl.startsWith(cloudinaryBase)) {
      return imageUrl;
    }

    // Extract filename by removing everything before the last '/'
    const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);

    // Construct new URL with thumbnail transformations
    return `${cloudinaryBase}q_auto:low/c_crop,h_768,w_537,x_5,y_0/c_scale,w_250/${filename}`;
  }

  /**
   * Generate S3 keys for a movie based on provider and title ID
   * This can be used to update existing movies or generate keys for new ones
   */
  generateS3KeysForMovie(providerTitleId: string, providerSlug: string) {
    return this._getMovieS3Key(providerTitleId, providerSlug);
  }

  // Placeholder test media keys (mirrors seeder test keys for temporary usage)
  private _getRandomTestMediaKeys() {
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
    return testContent[Math.floor(Math.random() * testContent.length)];
  }

  // Admin-only helpers for Providers CRUD
  async adminFindAllPaginated(query: PaginateQuery) {
    const paginateConfig: PaginateConfig<ProvidersEntity> = {
      sortableColumns: [
        'dateCreated',
        'dateUpdated',
        'name',
        'slug',
        'isActive',
      ],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['name', 'slug'],
      defaultLimit: 10,
      filterableColumns: {
        isActive: true,
        slug: true,
        dateCreated: [FilterOperator.GTE, FilterOperator.LTE],
      },
      select: [
        'id',
        'name',
        'slug',
        'baseUrl',
        'isActive',
        'dateCreated',
        'dateUpdated',
      ],
    };

    return await paginate(query, this.providersRepository, paginateConfig);
  }

  async adminFindOne(id: string) {
    const provider = await this.providersRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  async adminCreate(create: {
    name: string;
    slug: string;
    baseUrl: string;
    isActive: boolean;
  }) {
    const entity = this.providersRepository.create(create);
    try {
      return await this.providersRepository.save(entity);
    } catch (e: any) {
      // Postgres unique violation
      if (e && (e.code === '23505' || /duplicate key value/.test(e.message))) {
        throw new ConflictException('Provider slug already exists');
      }
      throw e;
    }
  }

  async adminUpdate(
    id: string,
    update: Partial<{
      name: string;
      slug: string;
      baseUrl: string;
      isActive: boolean;
    }>,
  ) {
    const provider = await this.providersRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    const allowedKeys: Array<keyof ProvidersEntity | keyof typeof update> = [
      'name',
      'slug',
      'baseUrl',
      'isActive',
    ];

    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(update, key)) {
        // @ts-expect-error dynamic assignment within allowed keys
        provider[key] = update[key as keyof typeof update] as any;
      }
    }

    try {
      return await this.providersRepository.save(provider);
    } catch (e: any) {
      if (e && (e.code === '23505' || /duplicate key value/.test(e.message))) {
        throw new ConflictException('Provider slug already exists');
      }
      throw e;
    }
  }

  async adminDelete(id: string) {
    const result = await this.providersRepository.delete({ id });
    return result.affected ?? 0;
  }
}
