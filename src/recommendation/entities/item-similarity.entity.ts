import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity } from 'typeorm';

@Entity('item_similarity')
export class ItemSimilarity extends BaseEntity {
  @Column()
  movieId: string;

  @Column()
  similarMovieId: string;

  @Column('float')
  score: number;
}
