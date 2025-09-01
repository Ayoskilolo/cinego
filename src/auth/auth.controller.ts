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
  Req,
  Ip,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { UserExistsDto } from '../user/dto/user-exists.dto';
import { LoginDto } from './dto/login.dto';
import { AllowPreProfile, Public } from './auth.decorator';
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
import { ProfileSelectionDto } from './dto/profile-selection.dto';
import { Request } from 'express';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
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

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login an existing user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in. Select a profile to continue',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    const userAgent = request.headers['user-agent'];
    const data = await this.authService.login(loginDto, userAgent, ip);
    return { data };
  }

  @AllowPreProfile()
  @Post('login/profile')
  @ApiOperation({ summary: 'Login an existing user with a specific profile' })
  @ApiBody({
    description: 'Profile ID',
    type: String,
  })
  @ApiResponse({ status: 200, description: 'User successfully logged in.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async loginWithProfile(
    @Body() profileSelectionDto: ProfileSelectionDto,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    const userAgent = request.headers['user-agent'];
    const user = request['user'];
    console.log({ user });
    const data = await this.authService.loginWithProfile(
      user.sub,
      profileSelectionDto.profileId,
      {
        ipAddress: ip,
        userAgent,
      },
    );
    return { data };
  }

  @Public()
  @Post('user-exists')
  @ApiOperation({ summary: 'Check if a user exists by email or phone number' })
  @ApiBody({ type: UserExistsDto })
  @ApiResponse({ status: 200, description: 'Returns whether the user exists.' })
  async checkIfUserExists(@Body() userExistsDto: UserExistsDto) {
    const data = await this.authService.checkIfUserExists(userExistsDto);
    return { data };
  }

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Access token refreshed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refreshToken(
      refreshTokenDto.refreshToken,
    );
    return { data: result };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get all active sessions for a user' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getSessions(@Req() request: Request) {
    const reqObj = request['user'];
    const result = await this.authService.getUserActiveSessions(reqObj.sub);
    return { data: result };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout a user' })
  @ApiResponse({ status: 200, description: 'User successfully logged out.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logout(@Req() request: Request) {
    const reqObj = request['user'];
    const result = await this.authService.logout(reqObj.sessionId);
    return { message: result.message };
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Logout all sessions for a user' })
  @ApiResponse({ status: 200, description: 'All sessions logged out.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logoutAll(@Req() request: Request) {
    const reqObj = request['user'];
    const result = await this.authService.logoutAll(reqObj.sub);
    return { message: result.message };
  }

  @Post('logout-specific-session/:sessionId')
  @ApiOperation({ summary: 'Logout a specific session for a user' })
  @ApiResponse({ status: 200, description: 'Session logged out.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logoutSpecificSession(
    @Req() request: Request,
    @Param('sessionId') sessionId: string,
  ) {
    const reqObj = request['user'];
    const result = await this.authService.logoutSpecificSession(
      reqObj.sub,
      sessionId,
    );
    return { message: result.message };
  }

  @Post('logout-all-except-current')
  @ApiOperation({ summary: 'Logout all sessions except the current one' })
  @ApiResponse({
    status: 200,
    description: 'All sessions logged out except current.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logoutAllExceptCurrent(@Req() request: Request) {
    const reqObj = request['user'];
    const result = await this.authService.logoutAllExceptCurrent(
      reqObj.sub,
      reqObj.sessionId,
    );
    return { message: result.message };
  }
}
