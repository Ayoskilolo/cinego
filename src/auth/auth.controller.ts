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
import { ValidateOtpDto } from './dto/validate-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';

@Public()
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'User registration details and optional profile picture',
    type: SignUpDto,
  })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @UseInterceptors(FileInterceptor('profilePicture'))
  async create(
    @Body() createAuthDto: SignUpDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.authService.signUp(createAuthDto, file);
    return { data };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login an existing user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'User successfully logged in.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return { data };
  }

  @Post('user-exists')
  @ApiOperation({ summary: 'Check if a user exists by email or phone number' })
  @ApiBody({ type: UserExistsDto })
  @ApiResponse({ status: 200, description: 'Returns whether the user exists.' })
  async checkIfUserExists(@Body() userExistsDto: UserExistsDto) {
    const data = await this.authService.checkIfUserExists(userExistsDto);
    return { data };
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Initiate password reset process' })
  @ApiBody({
    type: UserExistsDto,
    description: 'User email or phone to send reset instructions',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset instructions sent.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: UserExistsDto) {
    const data = await this.authService.forgotPassword(forgotPasswordDto);
    return { data };
  }

  @Post('validate-otp')
  @ApiOperation({
    summary: 'Validate OTP for password reset or other verification',
  })
  @ApiBody({ type: ValidateOtpDto })
  @ApiResponse({ status: 200, description: 'OTP validation status.' })
  @ApiResponse({ status: 400, description: 'Invalid OTP or bad request.' })
  @HttpCode(HttpStatus.OK)
  async validateOtp(@Body() validateOtpDto: ValidateOtpDto) {
    const result = await this.authService.validateOtp(validateOtpDto);
    return { valid: result.valid, message: result.message };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset user password using a valid OTP' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password successfully reset.' })
  @ApiResponse({ status: 400, description: 'Invalid OTP or bad request.' })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(resetPasswordDto);
    return { message: result.message };
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify user email using a token' })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token',
  })
  @ApiResponse({ status: 200, description: 'Email successfully verified.' })
  @ApiResponse({ status: 400, description: 'Invalid or missing token.' })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is missing.');
    }
    const result = await this.authService.verifyEmail(token);
    return { message: result.message, user: result.user };
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Verification email resent.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(@Body() resendDto: ResendVerificationDto) {
    const result = await this.authService.resendVerificationEmail(resendDto);
    return { message: result.message };
  }

  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend OTP to user email' })
  @ApiBody({ type: ResendOtpDto })
  @ApiResponse({ status: 200, description: 'OTP resent successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    const result = await this.authService.resendOtp(resendOtpDto);
    return { message: result.message };
  }
}
