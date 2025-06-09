import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { User } from '../../user/entities/user.entity';
import { Movie } from '../../movie/entities/movie.entity';

@Entity('comments')
export class Comment extends BaseEntity {
  @Column('text')
  content: string;

  @Column()
  userId: string;

  @Column()
  movieId: string;

  @ManyToOne(() => User, (user) => user.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Movie, (movie) => movie.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
}
