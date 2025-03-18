import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { ProvidersEntity } from 'src/providers/entities/providers.entity';

@Entity()
export class Movie extends BaseEntity {
  @Column()
  title: string;

  @Column()
  s3ObjectKey: string;

  @Column()
  providerId: string;

  @Column()
  providerTitleId: string;

  @Column()
  programType: string;

  @Column('text')
  synopsis: string;

  @Column()
  productionYear: string;

  @Column()
  marketRating: string;

  @Column()
  isHD: boolean;

  @Column()
  director: string;

  @Column('text', { array: true })
  cast: string[];

  @Column('text', { array: true })
  genres: string[];

  @Column('text', { array: true })
  languages: string[];

  @Column()
  duration: string;

  @Column('json')
  images: {
    poster: string;
    posterLandscape: string;
    thumbnail: string;
  };

  @ManyToOne(() => ProvidersEntity, (provider) => provider.movies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'providerId' })
  provider: ProvidersEntity;
}
