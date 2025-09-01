import { Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { MaturityRatings } from '../enum/maturityRatings';
import { User } from './user.entity';
import { WatchHistory } from './watch-history.entity';
import { MyListEntity } from '../../my-list/entities/my-list.entity';
import { Comment } from '../../comment/entities/comment.entity';
import { Review } from '../../review/entities/review.entity';
import { SessionEntity } from 'src/auth/entities/session.entity';

@Entity()
@Unique(['userId', 'pin'])
@Unique(['userId', 'profileName'])
export class Profile extends BaseEntity {
  constructor(partial: Partial<Profile>) {
    super();
    Object.assign(this, partial);
  }

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.profiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  profileName: string;

  @Column({ type: 'enum', enum: MaturityRatings })
  maturityRatings?: MaturityRatings;

  @Column({ nullable: true })
  profileImageUrl?: string;

  @Exclude()
  @Column('jsonb', { nullable: true })
  contentProfileJSON?: Record<string, any>;

  @Exclude()
  @Column({ type: 'timestamp', nullable: true })
  contentProfileUpdatedAt?: Date;

  // Relations

  @OneToMany(() => WatchHistory, (watchHistory) => watchHistory.profile)
  watchHistory: WatchHistory[];

  @OneToMany(() => MyListEntity, (myList) => myList.profile)
  myList: MyListEntity[];

  @OneToMany(() => Comment, (comment) => comment.profile)
  comments: Comment[];

  @OneToMany(() => Review, (review) => review.profile)
  reviews: Review[];

  @OneToMany(() => SessionEntity, (session) => session.currentProfile)
  sessions: SessionEntity[];

  @Exclude()
  @Column({ nullable: true })
  pin: string;

  @Expose()
  get hasPin(): boolean {
    return !!this.pin;
  }
}
