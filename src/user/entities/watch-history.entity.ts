import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { Profile } from './profile.entity';

@Entity()
export class WatchHistory extends BaseEntity {
  constructor(partial: Partial<WatchHistory>) {
    super();
    Object.assign(this, partial);
  }

  @Column()
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.watchHistory)
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column()
  movieId: string;

  @Column({ type: 'timestamp' })
  lastWatchedAt: Date;

  @Column({ type: 'int', default: 0 })
  watchDurationInSeconds: number;

  @Column({ type: 'float', default: 0 })
  watchProgress: number; // Percentage watched (0-100)

  @Column({ type: 'boolean', default: false })
  isCompleted: boolean;
}
