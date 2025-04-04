import { BaseEntity } from 'src/base-entity/base-entity.entity';
import { Movie } from 'src/movie/entities/movie.entity';
import { User } from 'src/user/entities/user.entity';
import { Entity, ManyToOne } from 'typeorm';

@Entity()
export class MyListEntity extends BaseEntity {
  @ManyToOne(() => User, (user) => user.myList)
  user: User;

  @ManyToOne(() => Movie, (movie) => movie.myList)
  movie: Movie;
}
