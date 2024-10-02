import {
  Controller,
  Post,
  Body,
  Get,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { UserExistsDto } from '../user/dto/user-exists.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './auth.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @UseInterceptors(FileInterceptor('profilePicture'))
  async create(
    @Body() createAuthDto: SignUpDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.authService.signUp(createAuthDto, file);
    return { data };
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return { data };
  }

  @Get('user-exists')
  async checkIfUserExists(@Body() userExistsDto: UserExistsDto) {
    const data = await this.authService.checkIfUserExists(userExistsDto);
    return { data, message: 'User does not exist' };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: UserExistsDto) {
    const data = await this.authService.forgotPassword(forgotPasswordDto);
    return { data, message: 'Password reset email sent' };
  }
}
