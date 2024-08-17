import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { MongoRepository, ObjectId } from 'typeorm';
import { UserExistsDto } from './dto/user-exists.dto';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { hash } from 'bcrypt';
import { SubscriptionType } from './enum/userType';
import { PaymentService } from '../payment/payment.service';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>,
    private readonly paymentService: PaymentService,
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
      //
    }

    createUserDto.dateOfBirth = new Date(createUserDto.dateOfBirth);
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

    let userPhoneNumberExists: User;
    let userEmailExists: User;

    if (phoneNumber) {
      phoneNumber = this.formatPhoneNumber(phoneNumber);

      userPhoneNumberExists = await this.userRepository.findOne({
        where: { phoneNumber: { $eq: phoneNumber } },
      });
    }

    if (email) {
      userEmailExists = await this.userRepository.findOne({
        where: { email: { $eq: email } },
      });
    }

    const userExists = !!userEmailExists || !!userPhoneNumberExists;

    return userExists;
  }

  async addPaymentService(
    userId: ObjectId,
    addPaymentMethodDto: AddPaymentMethodDto,
  ) {
    const user = await this.findOneById(userId);
    await this.paymentService.create({ ...addPaymentMethodDto, userId });
    return user;
  }

  async findOneById(id: ObjectId) {
    try {
      return await this.userRepository.findOneOrFail({
        where: { _id: id },
      });
    } catch (error) {
      console.log(error);
      throw new NotFoundException('User does not exist');
    }
  }

  async updateSubscriptionType(
    id: ObjectId,
    subscriptionType: SubscriptionType,
  ) {
    const user = await this.findOneById(id);
    user.subscriptionType = subscriptionType;
    return await this.userRepository.save(user);
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
