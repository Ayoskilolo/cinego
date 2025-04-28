import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { Profile } from './profile.entity';
import { SubscriptionType } from '../enum/userType';
import { PaymentPartner } from '../../payment/entities/payment-partner.entity';
import { Genres } from '../../movie/genres.enum';
import { Transaction } from 'src/transactions/entities/transaction.entity';
import { MyListEntity } from 'src/my-list/entities/my-list.entity';

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

  @Column({ default: false })
  isEmailVerified: boolean;

  @Exclude()
  @Column({ nullable: true })
  emailVerificationToken: string;

  @Exclude()
  @Column({ nullable: true })
  emailVerificationExpires: Date;

  @Column({ nullable: true, unique: true })
  phoneNumber: string;

  @Exclude()
  @Column({ nullable: true })
  password: string;

  @Exclude()
  @Column({ nullable: true })
  passwordResetOtp: string; // Added field for OTP

  @Exclude()
  @Column({ nullable: true })
  passwordResetExpires: Date; // Added field for OTP expiry

  @Column({ nullable: true })
  dateOfBirth: Date;

  @OneToMany(() => Profile, (profile) => profile.user)
  profiles: Profile[];

  @Column({ nullable: true })
  activeProfileId: string;

  @Column('text', { array: true, nullable: true })
  preferredGenres: string[];

  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // @Column({ nullable: true, unique: true })
  // List: Movie[];

  @Column({ nullable: true })
  displayPicture: string;

  // TODO: implement the subscription logic from when someone pays to updating the subscription type
  @Column({
    default: SubscriptionType.FREE_TIER,
    type: 'enum',
    enum: SubscriptionType,
  })
  subscriptionType: SubscriptionType;

  @Column({ default: false })
  isSubscribed: boolean;

  @Column({ nullable: true })
  subscriptionExpiresAt: Date | null;

  @OneToMany(() => PaymentPartner, (paymentPartner) => paymentPartner.user)
  paymentMethod: PaymentPartner;

  @Column({ default: false })
  hasUsedFreeTrial: boolean;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];

  @OneToMany(() => MyListEntity, (myList) => myList.user)
  myList: MyListEntity[];
}
