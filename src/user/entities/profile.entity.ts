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

@Entity()
@Unique(['userId', 'pin'])
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
  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // List: Movie[];

  @OneToMany(() => WatchHistory, (watchHistory) => watchHistory.profile)
  watchHistory: WatchHistory[];

  @Exclude()
  @Column({ nullable: true })
  pin: string;

  @Expose()
  get hasPin(): boolean {
    return !!this.pin;
  }
}
