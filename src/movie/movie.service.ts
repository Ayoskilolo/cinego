import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateMovieDto } from './dto/create-movie.dto';
import { Movie } from './entities/movie.entity';
import { Repository } from 'typeorm';
import { PaginateQuery, paginate } from 'nestjs-paginate';

@Injectable()
export class MovieService {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  create(createMovieDto: CreateMovieDto) {
    return 'This action adds a new movie' + createMovieDto;
  }

  searchMovies(query: PaginateQuery) {
    return paginate(query, this.movieRepository, {
      sortableColumns: ['dateCreated'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['title'],
      defaultLimit: 10,
      filterableColumns: { isActive: true },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} movie`;
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
