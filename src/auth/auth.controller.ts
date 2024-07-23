import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';

import { UserExistsDto } from 'src/user/dto/user-exists.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async create(@Body() createAuthDto: SignUpDto) {
    const data = await this.authService.signUp(createAuthDto);
    return { data };
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return { data };
  }

  @Post('user-exists')
  async checkIfUserExists(@Body() userExistsDto: UserExistsDto) {
    const data = await this.authService.checkIfUserExists(userExistsDto);
    return { data, message: 'User does not exist' };
  }
}
