import { BaseEntity } from 'src/base-entity/base-entity.entity';
import { Movie } from 'src/movie/entities/movie.entity';
import { Profile } from 'src/user/entities/profile.entity';
import { Entity, ManyToOne, JoinColumn, Column, Unique } from 'typeorm';

@Entity()
@Unique(['profileId', 'movieId'])
export class MyListEntity extends BaseEntity {
  @Column()
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.myList, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column()
  movieId: string;

  @ManyToOne(() => Movie, (movie) => movie.myList, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
}
