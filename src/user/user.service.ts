import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { MongoRepository } from 'typeorm';
import { UserExistsDto } from './dto/user-exists.dto';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { hash } from 'bcrypt';
import { SubscriptionType } from './enum/userType';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>,
  ) {}

  async create(createUserDto: SignUpDto) {
    if (!createUserDto.email && !createUserDto.phoneNumber) {
      throw new BadRequestException('Email or phone number required');
    }

    const userExists = await this.checkIfUserExists({
      email: createUserDto.email,
      phoneNumber: createUserDto.phoneNumber,
    });

    if (userExists) {
      throw new BadRequestException('Account already exists');
    }

    createUserDto.password = await hash(createUserDto.password, 8);

    if (createUserDto.phoneNumber) {
      createUserDto.phoneNumber = this.formatPhoneNumber(
        createUserDto.phoneNumber,
      );
    }

    if (createUserDto.subscriptionType === SubscriptionType.PREMIUM) {
    }

    const user = this.userRepository.create(createUserDto);

    return await this.userRepository.save(user);
  }

  formatPhoneNumber(phoneNumber: string) {
    if (phoneNumber.startsWith('234')) return;

    return phoneNumber.replace(/^0/, '234');
  }

  async checkIfUserExists({ email, phoneNumber }: UserExistsDto) {
    if (!email && !phoneNumber) {
      throw new BadRequestException('Email or phone number required');
    }

    if (phoneNumber) {
      phoneNumber = this.formatPhoneNumber(phoneNumber);
    }

    const userPhoneNumberExists = await this.userRepository.findOne({
      where: { phoneNumber },
    });

    const userEmailExists = await this.userRepository.findOne({
      where: { email },
    });

    const userExists = !!userEmailExists || !!userPhoneNumberExists;

    return userExists;
  }

  async findOneByEmail(email: string) {
    try {
      return await this.userRepository.findOneByOrFail({ email });
    } catch (error) {
      throw new NotFoundException('User does not exist');
    }
  }

  async findOneByPhoneNumber(phoneNumber: string) {
    try {
      return await this.userRepository.findOneByOrFail({ phoneNumber });
    } catch (error) {
      throw new NotFoundException('User does not exist');
    }
  }

  findAll() {
    return `This action returns all user`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
