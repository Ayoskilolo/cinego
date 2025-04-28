import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger, // Added Logger
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/sign-up.dto';
import { UserExistsDto } from '../user/dto/user-exists.dto';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../user/entities/user.entity';
import { compare, hash } from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailTemplateData } from 'src/mail/interfaces'; // Added EmailTemplateData import
import { ConfigService } from '@nestjs/config';
import { addMinutes } from 'date-fns'; // Ensure addMinutes is imported if needed later
import { ResendVerificationDto } from './dto/resend-verification.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
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
      const verificationLink = `${baseUrl}/auth/verify-email?token=${token}`; // Link for email clients

      const verificationEmailData: EmailTemplateData = {
        title: 'Verify Your Cinego Email Address',
        messages: [
          `Hi ${user.firstName},`,
          'Thanks for signing up for Cinego! Please use the token below in your app to verify your email address.',
          `Verification Token: ${token}`, // Include the token directly
          `If you didn't create an account, you can safely ignore this email.`,
          // `(If your email client supports links, you can also click here: ${verificationLink})`, // Optional link
        ],
        ctaText: 'Verify Email (Use Token in App)', // Adjust CTA text
        ctaLink: verificationLink, // Keep link for compatibility
      };

      await this.mailService.sendGeneralTemplatedMail({
        recipients: [user.email],
        subject: 'Cinego - Verify Your Email',
        templateData: verificationEmailData,
      });
      this.logger.log(`Verification email sent successfully to ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${user.email}: ${error.message}`,
      );
      // Log and continue signup
    }
    // --- End Email Verification ---

    // Send Welcome Email (Consider sending AFTER verification?)
    const welcomeEmailData: EmailTemplateData = {
      title: `Welcome to Cinego, ${user.firstName}!`,
      messages: [
        'We are thrilled to have you join our community of movie lovers.',
        'Get ready to explore a vast library of films and TV shows. Your cinematic journey starts now!',
        'If you have any questions or need help getting started, feel free to reach out to our support team.',
      ],
      ctaText: 'Start Watching',
      ctaLink: `${this.configService.get('FRONTEND_URL')}`,
      // address: 'Optional Address', // Add if needed
      // footerText: 'Optional Footer', // Add if needed
    };

    try {
      await this.mailService.sendGeneralTemplatedMail({
        recipients: [user.email],
        subject: 'Welcome to Cinego!',
        templateData: welcomeEmailData,
      });
      this.logger.log(`Welcome email sent successfully to ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to ${user.email}: ${error.message}`,
      );
    }

    if (file) {
      // TODO: Upload PROFILE PICTURE to cloudinary
      // const profilePicture = await this.fileService.uploadFile(file);
      // user.profilePicture = profilePicture;
    }

    // Fetch the user's profiles to include in the response
    const userWithProfiles = await this.userService.findOne(user.id);

    const payload = {
      sub: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      activeProfileId: user.activeProfileId, // Use activeProfileId from the created user
      isVerified: user.isEmailVerified, // Include verification status in token? Optional.
    };

    const accessToken = await this.jwtService.signAsync(payload);
    // Exclude sensitive fields before returning
    const {
      password,
      passwordResetOtp,
      passwordResetExpires,
      emailVerificationToken,
      emailVerificationExpires,
      ...safeUser
    } = userWithProfiles;
    return { accessToken, user: safeUser };
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
      const userWithProfile = await this.userService.findOne(user.id);
      const payload = {
        sub: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        activeProfileId: userWithProfile.activeProfileId,
      };

      const accessToken = await this.jwtService.signAsync(payload);
      return { accessToken, user: userWithProfile };
    }

    throw new UnauthorizedException('Invalid Credentials');
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
      const emailSent = await this.mailService.sendOTPMail(user.email, otp, 15); // Send OTP email (15 min expiry)

      if (!emailSent) {
        // Log the error but still return a generic success message to the user
        console.error(
          `Failed to send password reset OTP email to ${user.email}`,
        );
        // No need to revert the OTP generation in the DB here, the OTP will expire anyway.
      }

      return {
        message:
          'If an account exists for this identifier, a password reset email has been sent.',
      };
    } catch (error) {
      console.error(
        `Error during forgot password process for user ${user.id}: ${error.message}`,
      );
      // Return generic message even on internal errors during OTP generation/sending
      return {
        message:
          'If an account exists for this identifier, a password reset email has been sent.',
      };
    }
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    try {
      await this.userService.resetPasswordWithOtp(resetPasswordDto);
      return { message: 'Password has been reset successfully.' };
    } catch (error) {
      // Catch specific errors from userService if needed, otherwise rethrow or handle
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
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

    // Rate limiting check (
    if (
      user.emailVerificationExpires &&
      user.emailVerificationExpires > addMinutes(new Date(), -5)
    ) {
      throw new BadRequestException(
        'A verification email was recently sent. Please check your inbox or wait a few minutes.',
      );
    }

    try {
      // Use the reverted generateEmailVerificationToken
      const { token } = await this.userService.generateEmailVerificationToken(
        user.id,
      );
      const baseUrl =
        this.configService.get('app.baseUrl') || 'http://localhost:3000';
      const verificationLink = `${baseUrl}/auth/verify-email?token=${token}`;

      const verificationEmailData: EmailTemplateData = {
        title: 'Verify Your Cinego Email Address (Resend)',
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

      await this.mailService.sendGeneralTemplatedMail({
        recipients: [user.email],
        subject: 'Cinego - Verify Your Email',
        templateData: verificationEmailData,
      });

      this.logger.log(
        `Resent verification email successfully to ${user.email}`,
      );
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
}
