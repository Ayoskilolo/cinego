import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { ProvidersEntity } from 'src/providers/entities/providers.entity';
import { MyListEntity } from 'src/my-list/entities/my-list.entity';
import { Comment } from '../../comment/entities/comment.entity';
import { Review } from '../../review/entities/review.entity';
import { MovieNews } from '../../movie-news/entity/movie-news.entity';
import { MovieContentType } from 'src/movie/enums/movie-content-type.enum';

@Entity()
@Unique(['providerId', 'providerTitleId', 'contentType'])
@Unique(['seriesId', 'seasonNumber', 'episodeNumber'])
export class Movie extends BaseEntity {
  @Column()
  title: string;

  @Column()
  providerId: string;

  @Column()
  providerTitleId: string;

  @Column()
  programType: string;

  @Column({
    type: 'enum',
    enum: MovieContentType,
    default: MovieContentType.FILM,
  })
  contentType: MovieContentType;

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
  reviews: Review[];

  @OneToMany(() => MovieNews, (news) => news.movie)
  news: MovieNews[];

  @ManyToOne(() => Movie, (m) => m.episodes, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seriesId' })
  series?: Movie | null;

  @Column({ nullable: true })
  seriesId?: string | null;

  @OneToMany(() => Movie, (m) => m.series)
  episodes: Movie[];

  @Column({ nullable: true })
  seasonNumber?: number | null;

  @Column({ nullable: true })
  episodeNumber?: number | null;

  isInMyList?: boolean;
}
