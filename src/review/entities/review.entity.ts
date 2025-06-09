import { Column, Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { User } from '../../user/entities/user.entity';
import { Movie } from '../../movie/entities/movie.entity';

@Entity('reviews')
@Unique(['userId', 'movieId']) // Ensures a user can only review a movie once
export class Review extends BaseEntity {
  @Column('int')
  rating: number; // Rating out of 5

  @Column()
  userId: string;

  @Column()
  movieId: string;

  @ManyToOne(() => User, (user) => user.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Movie, (movie) => movie.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
}
