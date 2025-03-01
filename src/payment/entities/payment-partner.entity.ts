import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../base-entity/base-entity.entity';

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
}
