import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/sign-up.dto';
import { UserExistsDto } from '../user/dto/user-exists.dto';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../user/entities/user.entity';
import { compare } from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async checkIfUserExists(userExistsDto: UserExistsDto) {
    const userExists = await this.userService.checkIfUserExists(userExistsDto);

    if (userExists) {
      throw new BadRequestException('User already exists');
    }

    return userExists;
  }

  signUp(signUpDto: SignUpDto) {
    return this.userService.create(signUpDto);
  }

  async login({ email, phoneNumber, password }: LoginDto) {
    if (!email && !phoneNumber) {
      throw new BadRequestException('Email or phone number is required');
    }

    let user: User;

    try {
      if (email) {
        user = await this.userService.findOneByEmail(email);
      } else if (phoneNumber) {
        user = await this.userService.findOneByPhoneNumber(phoneNumber);
      }
    } catch (error) {
      throw new UnauthorizedException('Invalid Credentials');
    }

    const passwordsMatch = await compare(password, user.password);

    if (passwordsMatch) {
      const payload = {
        sub: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
      };

      const accessToken = await this.jwtService.signAsync(payload);
      return { accessToken, user };
    }

    throw new UnauthorizedException('Invalid Credentials');
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
