import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../base-entity/base-entity.entity';
import { Column, Entity } from 'typeorm';

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
}
