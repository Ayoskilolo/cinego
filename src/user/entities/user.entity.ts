import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity } from 'typeorm';
import { Profile } from './profile.entity';
import { SubscriptionType } from '../enum/userType';

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

  @Column()
  email: string;

  @Column({ nullable: true, unique: true })
  phoneNumber: string;

  @Exclude()
  @Column({ nullable: true, unique: true })
  password: string;

  @Column({ nullable: true, unique: true })
  profiles: Profile[];

  @Column({ nullable: true, unique: true })
  preferredGenres: string[];

  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // @Column({ nullable: true, unique: true })
  // List: Movie[];
  @Column({ nullable: true, unique: true })
  displayPicture: File;

  @Column({ nullable: true, unique: true })
  subscriptionType: SubscriptionType;

  @Column({ nullable: true, unique: true })
  userName: string;
}
