import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { MaturityRatings } from '../enum/maturityRatings';
import { User } from './user.entity';

@Entity()
export class Profile extends BaseEntity {
  constructor(partial: Partial<Profile>) {
    super();
    Object.assign(this, partial);
  }

  @Column()
  userId: string;

  @OneToMany(() => User, (user) => user.profiles)
  user: User;

  @Column()
  profileName: string;

  @Column({ type: 'enum', enum: MaturityRatings })
  maturityRatings: MaturityRatings;

  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // List: Movie[];

  @Exclude()
  @Column({ nullable: true, unique: true })
  pin: string;
}
