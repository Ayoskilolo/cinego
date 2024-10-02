import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
@Entity()
export class Movie extends BaseEntity {
  @Column()
  title: string;

  @Column()
  thumbnail: string;

  @Column('json')
  metadata: {
    ratings: string;
    familyRating: string;
    // other metadata
  };

  @Column()
  s3ObjectKey: string;
}
