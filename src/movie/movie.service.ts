import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateMovieDto } from './dto/create-movie.dto';
import { Movie } from './entities/movie.entity';
import { Repository } from 'typeorm';
import { FilterOperator, PaginateQuery, paginate } from 'nestjs-paginate';
import { Genres } from './genres.enum';
import { ProvidersService } from 'src/providers/providers.service';

@Injectable()
export class MovieService {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly providersService: ProvidersService,
  ) {}

  private readonly logger = new Logger(MovieService.name);

  async getMovies(query: PaginateQuery) {
    const movieCheck = await this.movieRepository.count();
    if (movieCheck < 1) {
      // call all active providers api and save to db
      const providers = await this.providersService.getActiveProviders();
      for (const provider of providers) {
        const movies =
          await this.providersService.getMoviesFromProvider(provider);

        if (movies.length) {
          for (const movie of movies) {
            const existingMovie = await this.movieRepository.findOne({
              where: { providerTitleId: movie.providerTitleId },
            });

            if (!existingMovie) {
              await this.movieRepository.save(movie);
            }
          }
        }
      }
    }
    return await this.searchMovies(query);
  }

  async searchMovies(query: PaginateQuery) {
    return await paginate(query, this.movieRepository, {
      sortableColumns: ['dateCreated', 'productionYear'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: [
        'title',
        'director',
        'cast',
        'synopsis',
        'genres',
        'languages',
      ],
      defaultLimit: 10,
      filterableColumns: {
        isHD: true,
        programType: true,
        productionYear: true,
        marketRating: true,
        director: true,
        genres: true,
        languages: true,
      },
      select: [
        'id',
        'title',
        'providerTitleId',
        'programType',
        'synopsis',
        'productionYear',
        'marketRating',
        'isHD',
        'director',
        'cast',
        'genres',
        'languages',
        'duration',
        'images',
        'dateCreated',
      ],
    });
  }

  async findOne(id: string) {
    const movie = await this.movieRepository.findOne({ where: { id } });

    const { s3ObjectKey, providerId, ...returnMovie } = movie;

    return { data: returnMovie };
  }

  async findByGenre(genre: string) {
    const result = await this.movieRepository
      .createQueryBuilder('movie')
      .where(':genre = ANY(movie.genres)', { genre: genre.toLowerCase() })
      .getMany();

    return { data: result };
  }

  async findAllGenres() {
    try {
      const result = await this.movieRepository
        .createQueryBuilder('movie')
        .select('DISTINCT UNNEST(movie.genres)', 'genre')
        .orderBy('genre', 'ASC')
        .getRawMany();

      const data = result.map((item) => item.genre);

      return { data };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching genres');
    }
  }
  // async getStreamingUrl(movieId: string): Promise<string> {
  //   // const movie = await this.movieRepository.findOne(movieId);

  //   if (!movie) {
  //     throw new Error('Movie not found');
  //   }

  //   const params = {
  //     Bucket: process.env.S3_BUCKET_NAME,
  //     Key: movie.s3ObjectKey,
  //     Expires: 3600, // URL expires in 1 hour
  //   };

  //   return this.s3.getSignedUrlPromise('getObject', params);
  // }

  remove(id: number) {
    return `This action removes a #${id} movie`;
  }
}
