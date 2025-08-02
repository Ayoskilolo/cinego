import { BaseEntity } from 'src/base-entity/base-entity.entity';
import { Movie } from 'src/movie/entities/movie.entity';
import { Profile } from 'src/user/entities/profile.entity';
import { Entity, ManyToOne, JoinColumn, Column } from 'typeorm';

@Entity()
export class MyListEntity extends BaseEntity {
  @Column()
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.myList)
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column()
  movieId: string;

  @ManyToOne(() => Movie, (movie) => movie.myList)
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
}
