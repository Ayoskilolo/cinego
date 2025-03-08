import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { User } from '../../user/entities/user.entity';

@Entity()
export class PaymentPartner extends BaseEntity {
  @Column()
  name: string;

  @Column()
  slug: string;

  @Column()
  order: number;

  @Column({ default: false })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.paymentMethod)
  @JoinColumn()
  user: User
}
