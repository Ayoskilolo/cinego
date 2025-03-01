import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { Profile } from './profile.entity';
import { SubscriptionType } from '../enum/userType';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { Genres } from '../../movie/genres.enum';
import { Transaction } from 'src/transactions/entities/transaction.entity';

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

  @Column({ nullable: true, unique: true })
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

  @Column('simple-array', { nullable: true })
  preferredGenres: Genres[];

  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // @Column({ nullable: true, unique: true })
  // List: Movie[];

  @Column({ nullable: true })
  displayPicture: string;

  @Column({
    default: SubscriptionType.FREE_TIER,
    type: 'enum',
    enum: SubscriptionType,
  })
  subscriptionType: SubscriptionType;

  @Column({ unique: true })
  userName: string;

  @Column({ default: false })
  isSubscribed: boolean;

  @OneToOne(() => PaymentMethod, (paymentMethod) => paymentMethod.user)
  paymentMethod: PaymentMethod;

  @Column({ default: false })
  hasUsedFreeTrial: boolean;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];
}
