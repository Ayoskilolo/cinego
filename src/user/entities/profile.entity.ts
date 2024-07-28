import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity } from 'typeorm';
import { MaturityRatings } from '../enum/maturityRatings';

@Entity()
export class Profile extends BaseEntity {
  constructor(partial: Partial<Profile>) {
    super();
    Object.assign(this, partial);
  }

  userId: string;

  @Column()
  profileName: string;

  @Column()
  maturityRatings: MaturityRatings;

  //TODO: build out logic to implement a list of movies watched by a user or profile?
  // List: Movie[];

  @Exclude()
  @Column({ nullable: true, unique: true })
  pin: string;
}
