import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MyListEntity } from './entities/my-list.entity';

@Injectable()
export class MyListService {
  constructor(
    @InjectRepository(MyListEntity)
    private readonly myListRepository: Repository<MyListEntity>,
  ) {}

  async addToMyList(userId: string, movieId: string) {
    const existingItem = await this.myListRepository.findOne({
      where: {
        user: { id: userId },
        movie: { id: movieId },
      },
    });

    if (existingItem) {
      return existingItem;
    }

    const myListItem = this.myListRepository.create({
      user: { id: userId },
      movie: { id: movieId },
    });

    return await this.myListRepository.save(myListItem);
  }

  async removeFromMyList(userId: string, movieId: string) {
    const item = await this.myListRepository.findOne({
      where: {
        user: { id: userId },
        movie: { id: movieId },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in MyList');
    }

    await this.myListRepository.remove(item);
    return { success: true };
  }

  async getMyList(userId: string) {
    const items = await this.myListRepository.find({
      where: { user: { id: userId } },
      relations: ['movie'],
    });

    return items.map((item) => item.movie);
  }

  async isInMyList(userId: string, movieId: string) {
    const item = await this.myListRepository.findOne({
      where: {
        user: { id: userId },
        movie: { id: movieId },
      },
    });

    return !!item;
  }
}
