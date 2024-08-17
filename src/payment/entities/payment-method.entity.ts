import { BaseEntity } from '../../base-entity/base-entity.entity';
import { User } from '../../user/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ObjectId,
  ObjectIdColumn,
  OneToOne,
} from 'typeorm';

@Entity()
export class PaymentMethod extends BaseEntity {
  @Column()
  cardNumber: string;

  @Column()
  expiryDate: string;

  @Column()
  cvv: string;

  @ObjectIdColumn()
  userId: ObjectId;

  @OneToOne(() => User, (user) => user.paymentMethod)
  @JoinColumn()
  user: User;
}
