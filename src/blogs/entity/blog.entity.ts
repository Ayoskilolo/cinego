import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm'
import { BlogComment } from './blog-comment.entity'

@Entity('blogs')
export class Blog {
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

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @OneToMany(() => BlogComment, (comment) => comment.blog)
  comments: BlogComment[]
}
