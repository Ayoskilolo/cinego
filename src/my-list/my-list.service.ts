import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MyListEntity } from './entities/my-list.entity';
import { Movie } from '../movie/entities/movie.entity';
import { MovieContentType } from '../movie/enums/movie-content-type.enum';

@Injectable()
export class MyListService {
  constructor(
    @InjectRepository(MyListEntity)
    private readonly myListRepository: Repository<MyListEntity>,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  async addToMyList(profileId: string, movieId: string) {
    const movie = await this.movieRepository.findOne({ where: { id: movieId } });
    if (!movie) {
      throw new NotFoundException(`Movie with ID "${movieId}" not found`);
    }
    let targetMovieId = movieId;
    if (movie.contentType === MovieContentType.EPISODE) {
      if (!movie.seriesId) {
        throw new BadRequestException('Episode is missing seriesId');
      }
      targetMovieId = movie.seriesId;
    }
    const existingItem = await this.myListRepository.findOne({
      where: {
        profile: { id: profileId },
        movie: { id: targetMovieId },
      },
    });
    if (existingItem) {
      return existingItem;
    }
    const myListItem = this.myListRepository.create({
      profile: { id: profileId },
      movie: { id: targetMovieId },
    });
    return await this.myListRepository.save(myListItem);
  }

  async removeFromMyList(profileId: string, movieId: string) {
    const item = await this.myListRepository.findOne({
      where: {
        profile: { id: profileId },
        movie: { id: movieId },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in MyList');
    }

    await this.myListRepository.remove(item);
    return { success: true };
  }

  async getMyList(profileId: string) {
    const items = await this.myListRepository.find({
      where: { profile: { id: profileId } },
      relations: ['movie'],
    });

    return items.map((item) => item.movie);
  }

  async isInMyList(profileId: string, movieId: string) {
    const item = await this.myListRepository.findOne({
      where: {
        profile: { id: profileId },
        movie: { id: movieId },
      },
    });

    return !!item;
  }

  /**
   * Get movie IDs that are in a user's MyList for multiple movies in a single query
   */
  async getMyListItemsBatch(
    profileId: string,
    movieIds: string[],
  ): Promise<string[]> {
    if (movieIds.length === 0) return [];

    const items = await this.myListRepository.find({
      where: {
        profile: { id: profileId },
        movie: { id: In(movieIds) },
      },
      select: ['movieId'],
    });

    return items.map((item) => item.movieId);
  }
}
