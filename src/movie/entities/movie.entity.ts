import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { ProvidersEntity } from 'src/providers/entities/providers.entity';
import { MyListEntity } from 'src/my-list/entities/my-list.entity';
import { Comment } from '../../comment/entities/comment.entity';
import { Review } from '../../review/entities/review.entity';
import { MovieNews } from '../../movie-news/entity/movie-news.entity'

@Entity()
export class Movie extends BaseEntity {
  @Column()
  title: string;

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

  @Column({ default: false })
  isPremium: boolean;

  @Column('json')
  images: {
    poster: string;
    posterLandscape: string;
    thumbnail: string;
  };

  @Column('json', { nullable: true })
  // s3 keys for the movie and trailer
  mediaKeys: {
    main: string;
    trailer?: string;
  };

  @OneToMany(() => MyListEntity, (myList) => myList.movie)
  myList: MyListEntity[];

  @ManyToOne(() => ProvidersEntity, (provider) => provider.movies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'providerId' })
  provider: ProvidersEntity;

  @OneToMany(() => Comment, (comment) => comment.movie)
  comments: Comment[];

  @OneToMany(() => Review, (review) => review.movie)
  reviews: Review[]

  @OneToMany(() => MovieNews, (news) => news.movie)
  news: MovieNews[]

  isInMyList?: boolean
}
