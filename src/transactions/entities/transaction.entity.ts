import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { User } from 'src/user/entities/user.entity';
import { PaymentChannel, PaymentReason, TransactionStatus } from '../enum'; // Import TransactionStatus

@Entity()
export class Transaction extends BaseEntity {
  @Column()
  amount: number;

  @Column({ unique: true }) // Ensure reference is unique
  reference: string;

  @Column({ nullable: true }) // Made nullable
  externalId: string | null; // The flutterwave transaction id

  @Column({ nullable: true }) // Made nullable
  externalReference: string | null; // The flutterwave transaction reference

  @Column({ type: 'enum', enum: PaymentReason })
  paymentReason: PaymentReason;

  @Column({
    type: 'enum',
    enum: PaymentChannel,
    default: PaymentChannel.FLUTTERWAVE,
  })
  paymentChanel: PaymentChannel; // Typo fixed: paymentChannel

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING, // Default to PENDING
  })
  status: TransactionStatus;

  @Column({ default: 0 })
  verificationAttempts: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastVerificationAttemptAt: Date | null;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'userId' })
  user: User;
}
