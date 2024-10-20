import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotAcceptableException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { differenceInYears } from 'date-fns';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Profile } from './entities/profile.entity';
import { UserExistsDto } from './dto/user-exists.dto';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { SubscriptionType } from './enum/userType';
import { PaymentService } from '../payment/payment.service';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { MaturityRatings } from './enum/maturityRatings';
import { CreateProfileDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly paymentService: PaymentService,
  ) {}

  async createUser(createUserDto: SignUpDto) {
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

    createUserDto.dateOfBirth = new Date(createUserDto.dateOfBirth);

    //Check if the user is less than age 18
    const today = new Date();
    const usersAgeInYears = differenceInYears(createUserDto.dateOfBirth, today);
    const maturityRatings =
      this.assignMaturityRatingsBasedonAge(usersAgeInYears);

    try {
      const user = this.userRepository.create(createUserDto);

      const initialUserProfile: CreateProfileDto = {
        userId: user.id,
        user,
        profileName: createUserDto.firstName,
        maturityRatings,
      };

      const userProfile = this.profileRepository.create(initialUserProfile);

      await this.profileRepository.save(userProfile);

      return await this.userRepository.save(user);
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  formatPhoneNumber(phoneNumber: string) {
    if (phoneNumber.startsWith('234')) return phoneNumber;

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
        where: { phoneNumber },
      });
    }

    if (email) {
      userEmailExists = await this.userRepository.findOne({
        where: { email },
      });
    }

    const userExists = !!userEmailExists || !!userPhoneNumberExists;

    return userExists;
  }

  async checkIfUserNameExists(userName: string) {
    if (!userName) {
      throw new BadRequestException('Please provide username');
    }

    const user = await this.userRepository.findOne({
      where: { userName },
    });

    if (user) {
      throw new NotAcceptableException('Username already in use.');
    } else {
      return true;
    }
  }

  //TODO: change this to receive already encrypted card information and send to updateSubscriptionType service's endppoint.
  async addPaymentService(
    userId: string,
    addPaymentMethodDto: AddPaymentMethodDto,
  ) {
    const user = await this.findOneById(userId);
    await this.paymentService.create({ ...addPaymentMethodDto, userId });
    return user;
  }

  async findOneById(id: string) {
    try {
      return await this.userRepository.findOneOrFail({
        where: { id: id },
      });
    } catch (error) {
      console.log(error);
      throw new NotFoundException('User does not exist');
    }
  }

  async updateSubscriptionType(
    id: string,
    subscriptionType: SubscriptionType,
    freeTrial?: boolean,
  ) {
    const user = await this.findOneById(id);
    user.subscriptionType = subscriptionType;

    //TODO: Call flutterwave to implement subscription using free trial, should then mark that user has used free trial.
    console.log(freeTrial);
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

  assignMaturityRatingsBasedonAge(userAge: number) {
    switch (userAge) {
      case 0:
        if (userAge < 13) return MaturityRatings.PG;
        break;
      case 1:
        if (userAge > 13 && userAge < 17) return MaturityRatings.PG_13;
        break;
      case 2:
        if (userAge > 17 && userAge < 18) return MaturityRatings.NC_17;
        break;
      case 3:
        if (userAge > 18) return MaturityRatings.R;
        break;
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
