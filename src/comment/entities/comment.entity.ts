import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Profile } from '../../user/entities/profile.entity';
import { Movie } from '../../movie/entities/movie.entity';

@Entity('comments')
export class Comment extends BaseEntity {
  @Column('text')
  content: string;

  @Column()
  profileId: string;

  @Column()
  movieId: string;

  @ManyToOne(() => Profile, (profile) => profile.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @ManyToOne(() => Movie, (movie) => movie.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
}
