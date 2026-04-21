import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';

export enum EmailCampaignStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('email_campaign_jobs')
export class EmailCampaignJob extends BaseEntity {
  @Column({
    type: 'enum',
    enum: EmailCampaignStatus,
    default: EmailCampaignStatus.PENDING,
  })
  status: EmailCampaignStatus;

  @Column({ default: 5 })
  movieLimit: number;

  @Column('text', { array: true, nullable: true })
  userIds: string[] | null;

  @Column({ default: 0 })
  totalUsers: number;

  @Column({ default: 0 })
  emailsSent: number;

  @Column({ default: 0 })
  emailsFailed: number;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  completedAt: Date;
}
