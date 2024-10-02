import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity, ManyToOne, OneToOne } from 'typeorm';
import { Profile } from './profile.entity';
import { SubscriptionType } from '../enum/userType';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';

@Entity()
export class User extends BaseEntity {
  constructor(partial: Partial<User>) {
    super();
    Object.assign(this, partial);
  }

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true, unique: true })
  phoneNumber: string;

  @Exclude()
  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @ManyToOne(() => Profile, (profile) => profile.user)
  profiles: Profile[];

  // @Column({ nullable: true })
  // preferredGenres: string[];

  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // @Column({ nullable: true, unique: true })
  // List: Movie[];

  @OneToOne(() => PaymentMethod, (paymentMethod) => paymentMethod.user)
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  displayPicture: string;

  @Column({
    default: SubscriptionType.FREE_TIER,
    type: 'enum',
    enum: SubscriptionType,
  })
  subscriptionType: SubscriptionType;

  @Column({ nullable: true, unique: true })
  userName: string;
}
