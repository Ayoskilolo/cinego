import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { User } from 'src/user/entities/user.entity';
import { PaymentChannel, TransactionStatus } from '../enum';

@Entity()
export class Transaction extends BaseEntity {
  @Column()
  amount: number;

  // @Column({ type: 'enum', enum: TransactionType })
  // transactionType: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ nullable: true })
  referenceId: string;

  @Column({ type: 'enum', enum: PaymentChannel })
  paymentChannel: PaymentChannel;

  @Column('jsonb', { nullable: true })
  providerInformation: any;

  @Column('uuid', { nullable: true })
  providerId: string;

  @Column()
  clientId: string;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn()
  user: User;
}
