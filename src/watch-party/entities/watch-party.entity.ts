import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';

export type WatchPartyStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';

@Entity()
export class WatchParty extends BaseEntity {
  @Column({ unique: true })
  channelName: string;

  @Column()
  movieId: string;

  @Column({ unique: true })
  joinCode: string;

  @Column({ nullable: true, unique: true })
  startKey?: string;

  @Column({ nullable: true })
  hostId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'hostId' })
  host?: User;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: WatchPartyStatus;

  @ManyToMany(() => User)
  @JoinTable({ name: 'watch_party_participants' })
  participants: User[];

  @ManyToMany(() => User)
  @JoinTable({ name: 'watch_party_invited_users' })
  invitedUsers: User[];

  @ManyToMany(() => User)
  @JoinTable({ name: 'watch_party_banned_users' })
  bannedUsers: User[];

  @ManyToMany(() => User)
  @JoinTable({ name: 'watch_party_muted_users' })
  mutedUsers: User[];

  @Column({ type: 'timestamp', nullable: true })
  endedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  scheduledFor?: Date;

  @Column({ type: 'timestamp', nullable: true })
  rotatedAt?: Date;

  @Column({ nullable: true })
  lastEndKey?: string;

  @Column({ nullable: true })
  lastStartScheduledKey?: string;
}