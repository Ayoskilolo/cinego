import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { WatchHistory } from './user/entities/watch-history.entity';
import { MyListEntity } from './my-list/entities/my-list.entity';
import { Comment } from './comment/entities/comment.entity';
import { Review } from './review/entities/review.entity';
import { ItemSimilarity } from './recommendation/entities/item-similarity.entity';

@Injectable()
export class ClearUserInteractionsSeeder implements Seeder {
  constructor(
    @InjectRepository(WatchHistory)
    private readonly watchHistoryRepository: Repository<WatchHistory>,
    @InjectRepository(MyListEntity)
    private readonly myListRepository: Repository<MyListEntity>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(ItemSimilarity)
    private readonly itemSimilarityRepository: Repository<ItemSimilarity>,
  ) {}
  private readonly logger = new Logger(ClearUserInteractionsSeeder.name);

  async seed(): Promise<any> {
    this.logger.log('🧹 Clearing user interactions data...');

    await Promise.all([
      this.watchHistoryRepository.delete({}),
      this.myListRepository.delete({}),
      this.commentRepository.delete({}),
      this.reviewRepository.delete({}),
      this.itemSimilarityRepository.delete({}),
    ]);

    this.logger.log('✅ User interactions data cleared successfully!');
    this.logger.log(
      'You can now run: npm run seed:user-interactions or npm run seed:user-interactions:dense',
    );
  }

  drop(): Promise<any> {
    return Promise.resolve();
  }
}
