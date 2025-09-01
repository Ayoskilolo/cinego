import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/sign-up.dto';
import { UserExistsDto } from '../user/dto/user-exists.dto';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../user/entities/user.entity';
import { compare, hash } from 'bcryptjs';
import { MailService } from '../mail/mail.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailTemplateData } from 'src/mail/interfaces';
import { ConfigService } from '@nestjs/config';
import { addDays, addMinutes, differenceInMinutes } from 'date-fns';
import * as bcrypt from 'bcryptjs';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ValidateOtpDto } from './dto/validate-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SessionEntity } from './entities/session.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Not, Repository } from 'typeorm';
import { UtilService } from '../util/util.service';
import { v4 as uuidv4 } from 'uuid';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionType } from './entities/session.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly utilService: UtilService,
  ) {}

  async checkIfUserExists(userExistsDto: UserExistsDto) {
    const userExists = await this.userService.checkIfUserExists(userExistsDto);

    if (userExists) {
      return { userExists, message: 'User exists' };
    } else {
      return { userExists, message: 'User does not exist' };
    }
  }

  async signUp(signUpDto: SignUpDto, file: Express.Multer.File) {
    const user = await this.userService.createUser(signUpDto);

    try {
      const { token } = await this.userService.generateEmailVerificationToken(
        user.id,
      );
      // Base URL for API endpoint (mobile app calls this directly)
      const baseUrl =
        this.configService.get('app.baseUrl') || 'http://localhost:3000';
      const verificationLink = `${baseUrl}/auth/verify-email?token=${token}`; // This link might be for direct GET, OTP template might not use it directly in CTA

      const emailVerificationDetails = {
        title: 'Verify Your Cinego Email Address',
        messages: [
          `Hi ${user.firstName},`,
          'Thanks for signing up for Cinego! Please use the token below in your app to verify your email address.',
          'This token will expire in 24 hours.',
          `If you didn't create an account, you can safely ignore this email.`,
        ],
        ctaText: 'Open Cinego App',
        ctaLink: `${this.configService.get('FRONTEND_URL')}`,
      };

      const emailVerificationExpiryMinutes = 24 * 60; // 24 hours

      const verificationEmailSent = await this.mailService.sendOTPMail(
        user.email,
        token, // This is the 'OTP' code for this context
        emailVerificationExpiryMinutes,
        emailVerificationDetails,
      );

      if (verificationEmailSent) {
        this.logger.log(
          `Verification email sent successfully to ${user.email}`,
        );

        // Update the emailVerificationSentAt field
        await this.userService.updateUser(user.id, {
          emailVerificationSentAt: new Date(),
        });
      } else {
        this.logger.error(
          `Failed to send verification email to ${user.email}. MailService returned false.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error during verification email sending process for ${user.email}: ${error.message}`,
      );
      // Log and continue signup
    }
    // --- End Email Verification ---

    // Send Welcome Email
    const welcomeEmailData: EmailTemplateData = {
      title: `Welcome to Cinego, ${user.firstName}!`,
      messages: [
        'We are thrilled to have you join our community of movie lovers.',
        'Get ready to explore a vast library of films and TV shows. Your cinematic journey starts now!',
        'If you have any questions or need help getting started, feel free to reach out to our support team.',
      ],
      ctaText: 'Start Watching',
      ctaLink: `${this.configService.get('FRONTEND_URL')}`,
    };

    try {
      const welcomeEmailSent = await this.mailService.sendGeneralTemplatedMail({
        recipients: [user.email],
        subject: 'Welcome to Cinego!',
        templateData: welcomeEmailData,
      });

      if (welcomeEmailSent) {
        this.logger.log(`Welcome email sent successfully to ${user.email}`);
      } else {
        this.logger.error(
          `Failed to send welcome email to ${user.email}. MailService returned false.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error during welcome email sending process for ${user.email}: ${error.message}`,
      );
    }

    if (file) {
      // TODO: Upload PROFILE PICTURE to cloudinary
      // const profilePicture = await this.fileService.uploadFile(file);
      // user.profilePicture = profilePicture;
    }

    // Fetch the user's profiles to include in the response
    const userWithProfiles = await this.userService.findOne(user.id);

    // const accessToken = await this.jwtService.signAsync(payload);
    // Exclude sensitive fields before returning
    const {
      password,
      passwordResetOtp,
      passwordResetExpires,
      emailVerificationToken,
      emailVerificationExpires,
      ...safeUser
    } = userWithProfiles;
    return { user: safeUser };
  }

  async login(
    { email, phoneNumber, password }: LoginDto,
    userAgent: string,
    ip: string,
  ) {
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
      const preProfileSession = await this.createPreProfileSession(user.id, {
        ipAddress: ip,
        userAgent,
      });

      const payload = {
        sub: user.id,
        sessionId: preProfileSession.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isVerified: user.isEmailVerified,
      };

      const accessToken = await this.jwtService.signAsync(payload);

      const userWithProfileInfo = await this.userService.findOne(user.id);
      return {
        user: userWithProfileInfo,
        tempAccessToken: accessToken,
        message: 'Select a profile to continue',
      };
    }

    throw new UnauthorizedException('Invalid Credentials');
  }

  async loginWithProfile(
    userId: string,
    profileId: string,
    deviceInfo: { ipAddress: string; userAgent: string },
  ) {
    const user = await this.userService.findOne(userId);
    const profile = user.profiles.find((profile) => profile.id === profileId);
    if (!profile) {
      throw new BadRequestException('Invalid profile');
    }

    const rawRefreshToken = uuidv4();
    const session = await this.createSession(
      userId,
      profileId,
      deviceInfo,
      rawRefreshToken,
    );

    const payload = {
      sub: user.id,
      sessionId: session.id,
      profileId: session.currentProfileId,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVerified: user.isEmailVerified, // Include verification status in token? Optional.
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const {
      password,
      passwordResetOtp,
      passwordResetExpires,
      emailVerificationToken,
      emailVerificationExpires,
      ...safeUser
    } = user;

    return {
      user: safeUser,
      message: 'Login successful',
      accessToken,
      refreshToken: `${session.id}.${rawRefreshToken}`,
      profile,
      deviceInfo: this.utilService.getSimpleDeviceInfo(deviceInfo.userAgent),
    };
  }

  async forgotPassword(
    forgotPasswordDto: UserExistsDto,
  ): Promise<{ message: string }> {
    const { email, phoneNumber } = forgotPasswordDto;

    if (!email && !phoneNumber) {
      throw new BadRequestException('Email or phone number is required');
    }

    let user: User;
    try {
      if (email) {
        user = await this.userService.findOneByEmail(email);
      } else {
        user = await this.userService.findOneByPhoneNumber(phoneNumber);
      }
    } catch (error) {
      // Even if user not found, return a generic message for security
      return {
        message:
          'If an account exists for this identifier, a password reset email has been sent.',
      };
    }

    // User found, proceed with OTP generation and email sending
    try {
      const { otp } = await this.userService.generatePasswordResetOtp(user.id);

      const otpEmailDetails = {
        title: 'Reset Your Cinego Password',
        messages: [
          `Hi ${user.firstName},`,
          'We received a request to reset your Cinego account password.',
          'This code will expire in 15 minutes.',
          'If you did not request a password reset, please ignore this email or contact support if you have concerns.',
        ],
        ctaText: 'Go to Cinego App',
        ctaLink: `${this.configService.get('FRONTEND_URL')}`,
        // footerCopyright: '© Cinego. All rights reserved.' // Optional: Add if needed
      };

      const emailSent = await this.mailService.sendOTPMail(
        user.email,
        otp,
        15,
        otpEmailDetails,
      );

      if (!emailSent) {
        this.logger.error(
          `Failed to send password reset OTP email to ${user.email}`,
        );
      } else {
        this.logger.log(
          `Password reset OTP email sent successfully to ${user.email}`,
        );
      }

      return {
        message:
          'If an account exists for this identifier, a password reset email has been sent.',
      };
    } catch (error) {
      this.logger.error(
        `Error during forgot password process for user ${user.id}: ${error.message}`,
      );
      // Return generic message even on internal errors during OTP generation/sending
      return {
        message:
          'If an account exists for this identifier, a password reset email has been sent.',
      };
    }
  }

  async validateOtp(
    validateOtpDto: ValidateOtpDto,
  ): Promise<{ valid: boolean; message: string }> {
    const { email, otp } = validateOtpDto;

    try {
      // Find user by email
      const user = await this.userService.findOneByEmail(email);

      // Check if OTP exists and is not expired
      if (!user.passwordResetOtp || !user.passwordResetExpires) {
        return { valid: false, message: 'Invalid or expired OTP.' };
      }

      // Check if OTP is expired
      if (user.passwordResetExpires < new Date()) {
        return {
          valid: false,
          message: 'OTP has expired. Please request a new one.',
        };
      }

      // Validate OTP using bcrypt compare
      const otpValid = await compare(otp, user.passwordResetOtp);
      if (!otpValid) {
        return { valid: false, message: 'Invalid OTP.' };
      }

      return { valid: true, message: 'OTP validated successfully.' };
    } catch (error) {
      this.logger.error(`Error validating OTP: ${error.message}`);
      return { valid: false, message: 'Invalid or expired OTP.' };
    }
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { email, otp, newPassword } = resetPasswordDto;

    try {
      // First validate the OTP
      const validation = await this.validateOtp({ email, otp });

      if (!validation.valid) {
        throw new BadRequestException(validation.message);
      }

      // Find the user
      const user = await this.userService.findOneByEmail(email);

      // Hash the new password
      const hashedPassword = await hash(newPassword, 10);

      // Update the user's password and clear OTP fields
      user.password = hashedPassword;
      user.passwordResetOtp = null;
      user.passwordResetExpires = null;

      await this.userService.updateUser(user.id, user);

      return { message: 'Password has been reset successfully.' };
    } catch (error) {
      // Catch specific errors from userService if needed, otherwise rethrow or handle
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(`Error resetting password: ${error.message}`);
      throw new InternalServerErrorException(
        'An error occurred while resetting the password.',
      );
    }
  }
  async verifyEmail(token: string) {
    try {
      // Use the reverted userService.verifyEmail which finds by plain token
      const user = await this.userService.verifyEmail(token);
      // Exclude sensitive fields before returning
      const {
        password,
        passwordResetOtp,
        passwordResetExpires,
        emailVerificationToken,
        emailVerificationExpires,
        ...safeUser
      } = user;
      return { message: 'Email verified successfully.', user: safeUser };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error; // Re-throw specific errors
      }
      this.logger.error(
        `Email verification failed for token: ${token}, Error: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'An error occurred during email verification.',
      );
    }
  }

  async resendVerificationEmail(
    resendDto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const { email } = resendDto;
    let user: User;

    try {
      user = await this.userService.findOneByEmail(email);
    } catch (error) {
      // Don't reveal if the email exists or not
      return {
        message:
          'If an account with this email exists and is not verified, a new verification email has been sent.',
      };
    }

    if (user.isEmailVerified) {
      return { message: 'This email address is already verified.' };
    }

    // Rate limiting check using emailVerificationSentAt instead of emailVerificationExpires
    if (
      user.emailVerificationSentAt &&
      user.emailVerificationSentAt > addMinutes(new Date(), -2)
    ) {
      const timeLeft = Math.ceil(
        (user.emailVerificationSentAt.getTime() - new Date().getTime()) /
          1000 /
          60,
      );
      throw new BadRequestException(
        `A verification email was recently sent. Please check your inbox or wait ${timeLeft} minute${timeLeft === 1 ? '' : 's'}.`,
      );
    }

    try {
      const { token } = await this.userService.generateEmailVerificationToken(
        user.id,
      );
      const baseUrl =
        this.configService.get('app.baseUrl') || 'http://localhost:3000';
      const verificationLink = `${baseUrl}/auth/verify-email?token=${token}`;

      const verificationEmailData: EmailTemplateData = {
        title: 'Verify Your Cinego Email Address',
        messages: [
          `Hi ${user.firstName},`,
          'Here is your new verification token. Please use it in your app to verify your email address.',
          `Verification Token: ${token}`,
          `If you didn't request this, you can safely ignore this email.`,
          // `(Link for email clients: ${verificationLink})`,
        ],
        ctaText: 'Verify Email (Use Token in App)',
        ctaLink: verificationLink,
      };

      const emailSent = await this.mailService.sendGeneralTemplatedMail({
        recipients: [user.email],
        subject: 'Cinego - Verify Your Email',
        templateData: verificationEmailData,
      });

      if (emailSent) {
        // Update the emailVerificationSentAt field
        await this.userService.updateUser(user.id, {
          ...user,
          emailVerificationSentAt: new Date(),
        });

        this.logger.log(
          `Resent verification email successfully to ${user.email}`,
        );
      } else {
        this.logger.error(`Failed to send verification email to ${user.email}`);
      }

      return {
        message:
          'If an account with this email exists and is not verified, a new verification email has been sent.',
      };
    } catch (error) {
      this.logger.error(
        `Failed to resend verification email to ${user.email}: ${error.message}`,
      );
      // Return a generic message even on failure
      return {
        message:
          'If an account with this email exists and is not verified, a new verification email has been sent.',
      };
    }
  }

  async resendOtp(resendOtpDto: ResendOtpDto): Promise<{ message: string }> {
    const { email } = resendOtpDto;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    let user: User;
    try {
      if (email) {
        user = await this.userService.findOneByEmail(email);
      }
    } catch (error) {
      // Even if user not found, return a generic message for security
      return {
        message:
          'If an account exists for this identifier, a password reset code has been sent.',
      };
    }

    // Check if we can send a new OTP (rate limiting)
    if (user.passwordResetOtpSentAt) {
      const timeSinceLastOtp = differenceInMinutes(
        new Date(),
        user.passwordResetOtpSentAt,
      );

      // Rate limit: Allow new OTP only after 2 minutes
      if (timeSinceLastOtp < 2) {
        return {
          message: `Please wait ${2 - timeSinceLastOtp} minute(s) before requesting a new code.`,
        };
      }
    }

    // Generate new OTP
    try {
      const { otp } = await this.userService.generatePasswordResetOtp(user.id);

      const resendOtpEmailDetails = {
        title: 'Your Cinego Password Reset Code',
        messages: [
          `Hi ${user.firstName},`,
          'You requested a new password reset code for your Cinego account.',
          'This code will expire in 15 minutes.',
          'If you did not request this, please ignore this email or contact support if you have concerns.',
        ],
        // ctaText: 'Go to Cinego App', // Optional, can be added if needed
        // ctaLink: `${this.configService.get('FRONTEND_URL')}`,
        // footerCopyright: '© Cinego. All rights reserved.' // Optional
      };

      const emailSent = await this.mailService.sendOTPMail(
        user.email,
        otp,
        15,
        resendOtpEmailDetails,
      );

      if (emailSent) {
        // Update the sent timestamp
        await this.userService.updateUser(user.id, {
          ...user,
          passwordResetOtpSentAt: new Date(),
        });

        this.logger.log(
          `Password reset OTP sent successfully to ${user.email}`,
        );
      } else {
        this.logger.error(
          `Failed to send password reset OTP to ${user.email}. MailService returned false.`,
        );
      }

      return {
        message:
          'If an account exists for this identifier, a password reset code has been sent.',
      };
    } catch (error) {
      this.logger.error(
        `Error during OTP resend process for ${user.email || user.phoneNumber}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to process your request');
    }
  }

  async refreshToken(refreshToken: string) {
    const [sessionId, rawRefreshToken] = refreshToken.split('.');

    const sessions = await this.sessionRepository.find({
      where: {
        id: sessionId,
        isActive: true,
        refreshTokenExpiresAt: MoreThan(new Date()),
      },
      relations: ['user'],
    });

    if (!sessions.length) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let session = null;

    for (let i = 0; i < sessions.length; i++) {
      let currentSession = sessions[i];
      const isMatch = await bcrypt.compare(
        rawRefreshToken,
        currentSession.refreshTokenHash,
      );
      if (isMatch) {
        session = currentSession;
        break;
      }
    }

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Refresh token rotation

    const newRawRefreshToken = uuidv4();
    session.refreshTokenHash = await bcrypt.hash(newRawRefreshToken, 10);
    session.refreshTokenExpiresAt = addDays(new Date(), 30);
    await this.sessionRepository.save(session);

    const user = session.user;

    const payload = {
      sub: user.id,
      sessionId: session.id,
      profileId: session.currentProfileId,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVerified: user.isEmailVerified,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, refreshToken: `${session.id}.${newRawRefreshToken}` };
  }

  async getUserActiveSessions(userId: string) {
    const sessions = await this.sessionRepository.find({
      where: { userId, isActive: true },
      relations: ['currentProfile'],
    });

    const mappedSessions = sessions.map((session) => {
      const { refreshTokenHash, refreshTokenExpiresAt, ...sessionData } =
        session;
      return {
        ...sessionData,
        deviceInfo: this.utilService.getSimpleDeviceInfo(session.userAgent),
      };
    });

    return mappedSessions;
  }

  async logout(sessionId: string) {
    await this.sessionRepository.update(sessionId, {
      isActive: false,
      loggedOutAt: new Date(),
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });
    return { message: 'User successfully logged out.' };
  }

  async logoutAll(userId: string) {
    await this.sessionRepository.update(
      { userId, isActive: true },
      {
        isActive: false,
        loggedOutAt: new Date(),
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      },
    );
    return { message: 'All sessions logged out.' };
  }

  async logoutSpecificSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId, isActive: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found or already inactive.');
    }

    await this.sessionRepository.update(sessionId, {
      isActive: false,
      loggedOutAt: new Date(),
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });

    return {
      message: `Session on ${this.utilService.getSimpleDeviceInfo(session.userAgent)} logged out successfully.`,
    };
  }

  async logoutAllExceptCurrent(userId: string, currentSessionId: string) {
    try {
      const result = await this.sessionRepository.update(
        { userId, isActive: true, id: Not(currentSessionId) },
        {
          isActive: false,
          loggedOutAt: new Date(),
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      );

      return {
        message: `Logged out other active sessions.`,
      };
    } catch (error) {
      this.logger.error(
        `Error during logoutAllExceptCurrent for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to process your request');
    }
  }

  async createSession(
    userId: string,
    profileId: string,
    deviceInfo: { ipAddress: string; userAgent: string },
    rawRefreshToken: string,
  ) {
    const session = new SessionEntity();
    session.userId = userId;
    session.currentProfileId = profileId;
    session.ipAddress = deviceInfo.ipAddress;
    session.userAgent = deviceInfo.userAgent;
    session.isActive = true;
    session.expiresAt = addDays(new Date(), 30); // 30 days

    const refreshTokenHash = await bcrypt.hash(rawRefreshToken, 10);

    session.refreshTokenHash = refreshTokenHash;
    session.refreshTokenExpiresAt = addDays(new Date(), 30);

    return this.sessionRepository.save(session);
  }

  async createPreProfileSession(
    userId: string,
    deviceInfo: { ipAddress: string; userAgent: string },
  ) {
    const session = new SessionEntity();
    session.userId = userId;
    session.ipAddress = deviceInfo.ipAddress;
    session.userAgent = deviceInfo.userAgent;
    session.isActive = true;
    session.sessionType = SessionType.PRE_PROFILE;
    session.expiresAt = addMinutes(new Date(), 10);

    return this.sessionRepository.save(session);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanUpExpiredSessions() {
    await this.sessionRepository.delete({
      isActive: false,
      refreshTokenExpiresAt: LessThan(new Date()),
    });

    await this.sessionRepository.delete({
      refreshTokenExpiresAt: LessThan(new Date()),
    });

    this.logger.log('WEEKLY CRON JOB:Expired sessions cleaned up');
  }
}
