import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProvidersEntity } from './entities/providers.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

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

  async getMoviesFromProvider(provider: ProvidersEntity) {
    let movies = [];
    if (provider.slug === 'allrites') {
      const response = await this._fetchAllritesMetadata(provider.baseUrl, {
        month: 'January',
        year: '2025',
      });

      movies = this._extractAllritesMoviesMetadata(response).map((movie) => ({
        ...movie,
        providerId: provider.id,
        s3ObjectKey: '', // TODO: add s3 object key as this is a placeholder
      }));
    }

    return movies;
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
}
