import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Profile } from '../../user/entities/profile.entity';
import { User } from '../../user/entities/user.entity';
import { SessionType } from './session.enum';

@Entity('sessions')
export class SessionEntity extends BaseEntity {
  @Column()
  userId: string;

  @Column({ nullable: true })
  currentProfileId: string;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  refreshTokenHash: string;

  @Column({ nullable: true })
  refreshTokenExpiresAt: Date;

  @Column()
  ipAddress: string;

  @Column()
  userAgent: string;

  @Index()
  @Column({ default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: SessionType,
    default: SessionType.WITH_PROFILE,
  })
  sessionType: SessionType;

  @Column({ nullable: true })
  loggedOutAt: Date;

  // Relations

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Profile, (profile) => profile.sessions)
  @JoinColumn({ name: 'currentProfileId' })
  currentProfile: Profile;
}
