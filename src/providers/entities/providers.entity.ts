import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Movie } from 'src/movie/entities/movie.entity';
@Entity()
export class ProvidersEntity extends BaseEntity {
  @Column()
  name: string;

  @Column()
  slug: string;

  @Column()
  baseUrl: string;

  @Column()
  isActive: boolean;

  @OneToMany(() => Movie, (movie) => movie.provider)
  movies: Movie[];
}
