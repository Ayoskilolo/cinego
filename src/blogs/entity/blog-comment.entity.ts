import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Profile } from '../../user/entities/profile.entity';
import { Blog } from './blog.entity';

@Entity('blog_comments')
export class BlogComment extends BaseEntity {
  @Column('text')
  content: string;

  @Column()
  profileId: string;

  @Column()
  blogId: string;

  @ManyToOne(() => Profile, (profile) => profile.blogComments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @ManyToOne(() => Blog, (blog) => blog.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blogId' })
  blog: Blog;
}
