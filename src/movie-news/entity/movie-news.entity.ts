import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Movie } from '../../movie/entities/movie.entity'

@Entity('movie_news')
export class MovieNews {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  title: string

  @Column('text')
  content: string

  @Column({ nullable: true })
  author: string

  @Column({ nullable: true })
  description: string

  @Column()
  movieId: string

  @ManyToOne(() => Movie, (movie) => movie.news, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieId' })
  movie: Movie

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}