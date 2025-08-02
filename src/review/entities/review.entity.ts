import { Column, Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Profile } from '../../user/entities/profile.entity';
import { Movie } from '../../movie/entities/movie.entity';

@Entity('reviews')
@Unique(['profileId', 'movieId']) // Ensures a profile can only review a movie once
export class Review extends BaseEntity {
  @Column('int')
  rating: number; // Rating out of 5

  @Column()
  profileId: string;

  @Column()
  movieId: string;

  @ManyToOne(() => Profile, (profile) => profile.reviews, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @ManyToOne(() => Movie, (movie) => movie.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
}
