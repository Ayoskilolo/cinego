import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { UserExistsDto } from '../user/dto/user-exists.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './auth.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

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

  @Post('user-exists')
  async checkIfUserExists(@Body() userExistsDto: UserExistsDto) {
    const data = await this.authService.checkIfUserExists(userExistsDto);
    return { data };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: UserExistsDto) {
    const data = await this.authService.forgotPassword(forgotPasswordDto);
    return { data };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(resetPasswordDto);
    return { message: result.message };
  }

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is missing.');
    }
    const result = await this.authService.verifyEmail(token);
    return { message: result.message, user: result.user };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(@Body() resendDto: ResendVerificationDto) {
    const result = await this.authService.resendVerificationEmail(resendDto);
    return { message: result.message };
  }
}
