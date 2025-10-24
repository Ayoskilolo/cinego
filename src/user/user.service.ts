import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { differenceInYears, addMinutes, addHours, addDays } from 'date-fns';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Profile } from './entities/profile.entity';
import { UserExistsDto } from './dto/user-exists.dto';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { SubscriptionType } from './enum/userType';
import { MaturityRatings } from './enum/maturityRatings';
import { CreateProfileDto } from './dto/create-user.dto';
import { Genres } from '../movie/genres.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtService } from '@nestjs/jwt';
import { Not } from 'typeorm';
import { WatchHistory } from './entities/watch-history.entity';
import { UpdateWatchHistoryDto } from './dto/update-watch-history.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { EmailTemplateData } from 'src/mail/interfaces';
import { MailService } from 'src/mail/mail.service';
import { SessionEntity } from '../auth/entities/session.entity';
import { PaginateQuery, paginate, PaginateConfig, FilterOperator } from 'nestjs-paginate';
import { isISO8601, isEmail } from 'class-validator';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(WatchHistory)
    private readonly watchHistoryRepository: Repository<WatchHistory>,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
  ) {}

  async createUser(createUserDto: SignUpDto) {
    // Require email for account creation; phoneNumber remains optional
    if (!createUserDto.email) {
      throw new BadRequestException('Email is required');
    }

    // Check if the user already exists based on email or phone number.
    const userExists = await this.checkIfUserExists({
      email: createUserDto.email,
      phoneNumber: createUserDto.phoneNumber,
    });

    if (userExists) {
      throw new BadRequestException(
        'Account already exists. Please check the email or phone number.',
      );
    }

    createUserDto.password = await hash(createUserDto.password, 8);

    if (createUserDto.phoneNumber) {
      createUserDto.phoneNumber = this.formatPhoneNumber(
        createUserDto.phoneNumber,
      );
    }

    createUserDto.dateOfBirth = new Date(createUserDto.dateOfBirth);

    const user = this.userRepository.create({
      ...createUserDto,
      isEmailVerified: false,
    });

    try {
      await this.userRepository.save(user);
    } catch (error) {
      throw new InternalServerErrorException(
        `An error occurred while trying to register: ${error.message}`,
      );
    }

    // Create profile based on provided information or defaults
    const today = new Date();
    const usersAgeInYears = differenceInYears(today, createUserDto.dateOfBirth);
    const maturityRatings =
      createUserDto.maturityRatings ||
      this.assignMaturityRatingsBasedonAge(usersAgeInYears);

    try {
      const initialUserProfile: CreateProfileDto = {
        userId: user.id,
        user,
        profileName: createUserDto.profileName || createUserDto.firstName,
        maturityRatings,
      };

      const defaultKidsProfile: CreateProfileDto = {
        userId: user.id,
        user,
        profileName: user.lastName + 'Kids',
        maturityRatings: MaturityRatings.PG,
      };

      const userProfile = this.profileRepository.create(initialUserProfile);
      const kidsProfile = this.profileRepository.create(defaultKidsProfile);
      await this.profileRepository.save(userProfile);
      await this.profileRepository.save(kidsProfile);

      await this.userRepository.save(user);

      return user;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to create initial profile',
      );
    }
  }

  async createProfile(userId: string, createProfileDto: CreateProfileDto) {
    try {
      const user = await this.findOneById(userId);

      if (!user) {
        throw new NotFoundException('User does not exist.');
      }

      // Check for maximum profiles (5)
      const existingProfiles = await this.profileRepository.find({
        where: { userId },
      });

      if (existingProfiles.length >= 5) {
        throw new BadRequestException(
          'Maximum number of profiles (5) reached.',
        );
      }

      // Check for duplicate profile names
      const duplicateProfile = await this.profileRepository.findOne({
        where: {
          userId,
          profileName: createProfileDto.profileName,
        },
      });

      if (duplicateProfile) {
        throw new BadRequestException(
          'A profile with this name already exists.',
        );
      }

      // Hash the PIN if it is provided
      if (createProfileDto.pin) {
        createProfileDto.pin = await hash(createProfileDto.pin, 8);
      }

      createProfileDto.userId = user.id;

      const userProfile = this.profileRepository.create(createProfileDto);
      await this.profileRepository.save(userProfile);
      return userProfile;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in creating this profile.',
        error,
      );
    }
  }

  async updateProfile(
    userId: string,
    profileId: string,
    updateProfileDto: UpdateProfileDto,
  ) {
    try {
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
        relations: ['user'],
      });

      if (!profile) {
        throw new NotFoundException('Profile not found');
      }

      // Check for duplicate profile names
      if (updateProfileDto.profileName) {
        const duplicateProfile = await this.profileRepository.findOne({
          where: {
            userId,
            profileName: updateProfileDto.profileName,
            id: Not(profileId), // Exclude current profile from check
          },
        });

        if (duplicateProfile) {
          throw new BadRequestException('Profile name already exists');
        }
      }

      // Hash the PIN if it is being updated
      if (updateProfileDto.pin) {
        updateProfileDto.pin = await hash(updateProfileDto.pin, 8);
      }

      Object.assign(profile, updateProfileDto);
      return await this.profileRepository.save(profile);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update profile');
    }
  }

  async deleteProfile(userId: string, profileId: string, sessionId: string) {
    try {
      const session = await this.sessionRepository.findOneOrFail({
        where: { id: sessionId, isActive: true, userId },
      });

      if (session.currentProfileId === profileId) {
        throw new BadRequestException(
          'Cannot delete the active profile. Switch profiles first.',
        );
      }
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
      });

      if (!profile) {
        throw new NotFoundException('Profile not found.');
      }

      await this.profileRepository.remove(profile);
      return { message: 'Profile deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in deleting this profile.',
        error,
      );
    }
  }

  async switchProfile(userId: string, newProfileId: string, sessionId: string) {
    try {
      const profile = await this.profileRepository.findOne({
        where: { id: newProfileId, userId },
        relations: ['user'],
      });

      if (!profile || profile.user.id !== userId) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

      const session = await this.sessionRepository.findOneOrFail({
        where: { id: sessionId, isActive: true, userId },
      });

      session.currentProfileId = newProfileId;

      // Generate a new JWT token with the profile information
      const user = await this.findOneById(userId);
      const payload = {
        sub: user.id,
        sessionId: session.id,
        profileId: session.currentProfileId,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isVerified: user.isEmailVerified,
      };

      // Generate a new refresh token
      const newRawRefreshToken = uuidv4();
      session.refreshTokenHash = await hash(newRawRefreshToken, 10);
      session.refreshTokenExpiresAt = addDays(new Date(), 30);

      // Save the session
      await this.sessionRepository.save(session);

      const accessToken = await this.jwtService.signAsync(payload);

      return {
        profile,
        accessToken,
        refreshToken: `${session.id}.${newRawRefreshToken}`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in switching profiles.',
        error,
      );
    }
  }

  async getCurrentProfile(user: any) {
    try {
      const profile = await this.profileRepository.findOne({
        where: { id: user.profileId, userId: user.sub },
      });

      if (!profile) {
        throw new NotFoundException('Profile not found');
      }

      return profile;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get current profile');
    }
  }

  async getAllUserProfiles(userId: string) {
    try {
      const profiles = await this.profileRepository.find({
        where: { userId },
      });

      return profiles;
    } catch (e) {
      throw new InternalServerErrorException(e.message);
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

  async updateUserGenres(userId: string, genres: Genres[]) {
    try {
      const user = await this.findOneById(userId);

      user.preferredGenres = genres;
      await this.userRepository.save(user);
    } catch (error) {
      throw new InternalServerErrorException(
        'Something went wrong in updating user genres.',
      );
    }
  }

  async findOneById(id: string) {
    try {
      return await this.userRepository.findOneOrFail({
        where: { id: id },
      });
    } catch (error) {
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

  async findOneByEmail(email: string): Promise<User> {
    try {
      return await this.userRepository.findOneByOrFail({ email });
    } catch (error) {
      throw new NotFoundException('User does not exist');
    }
  }

  async findOneByPhoneNumber(phoneNumber: string): Promise<User> {
    try {
      const formattedPhoneNumber = this.formatPhoneNumber(phoneNumber); // Ensure phone number is formatted
      return await this.userRepository.findOneByOrFail({
        phoneNumber: formattedPhoneNumber,
      });
    } catch (error) {
      throw new NotFoundException('User does not exist');
    }
  }

  async generatePasswordResetOtp(userId: string) {
    const user = await this.findOneById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = addMinutes(new Date(), 15); // OTP valid for 15 minutes

    // Hash the OTP before storing
    const hashedOtp = await hash(otp, 8);

    // Update user with new OTP and expiry
    user.passwordResetOtp = hashedOtp;
    user.passwordResetExpires = otpExpiry;
    user.passwordResetOtpSentAt = new Date(); // Track when OTP was sent

    await this.userRepository.save(user);

    return { otp };
  }

  async resetPasswordWithOtp(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<User> {
    const { email, otp, newPassword } = resetPasswordDto;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    let user: User;
    try {
      if (email) {
        user = await this.findOneByEmail(email);
      }
    } catch (error) {
      throw new NotFoundException('User not found.');
    }

    if (!user.passwordResetOtp || !user.passwordResetExpires) {
      throw new BadRequestException(
        'Password reset not requested or already completed.',
      );
    }

    if (new Date() > user.passwordResetExpires) {
      // Clear expired OTP fields
      user.passwordResetOtp = null;
      user.passwordResetExpires = null;
      await this.userRepository.save(user);
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    const isOtpValid = await compare(otp, user.passwordResetOtp);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid OTP.');
    }

    // Reset password and clear OTP fields
    user.password = await hash(newPassword, 8);
    user.passwordResetOtp = null;
    user.passwordResetExpires = null;

    try {
      await this.userRepository.save(user);
      return user;
    } catch (error) {
      throw new InternalServerErrorException('Failed to reset password.');
    }
  }

  async generateEmailVerificationToken(
    userId: string,
  ): Promise<{ token: string; expires: Date }> {
    const user = await this.findOneById(userId);
    const timestamp = Math.floor(Date.now() / 1000).toString(36);
    const randomChars = Math.random().toString(36).substring(2, 5);
    const token = `${timestamp}-${randomChars}`; // Format: xxxxxx-xxx (where x are alphanumeric)
    const expires = addHours(new Date(), 24); // Token expires in 24 hours

    user.emailVerificationToken = token;
    user.emailVerificationExpires = expires;
    user.isEmailVerified = false; // Ensure verification status is false

    try {
      await this.userRepository.save(user);
      return { token, expires };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to save email verification token.',
      );
    }
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token.');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email already verified.');
    }

    if (new Date() > user.emailVerificationExpires) {
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      await this.userRepository.save(user);
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    // Mark email as verified and clear token fields
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    const verificationSuccessEmailData: EmailTemplateData = {
      title: 'Email Verification Successful!',
      messages: [
        `Hi ${user.firstName},`,
        'Your email has been successfully verified. Welcome to Cinego!',
        'You can now enjoy all the features of your account.',
        'Thank you for choosing Cinego for your entertainment needs.',
        'Start watching your favorite movies and shows today!',
      ],
      ctaText: 'Go to Cinego',
      ctaLink: '#',
    };

    const verificationSuccessEmailSent =
      await this.mailService.sendGeneralTemplatedMail({
        recipients: [user.email],
        subject: 'Cinego - Verify Your Email',
        templateData: verificationSuccessEmailData,
      });

    if (verificationSuccessEmailSent) {
      this.logger.log(
        `Verification success email sent successfully to ${user.email}`,
      );

      try {
        await this.userRepository.save(user);
        return user;
      } catch (error) {
        throw new InternalServerErrorException('Failed to verify email.');
      }
    }
  }

  async startFreeTrial(userId: string): Promise<User> {
    const user = await this.findOneById(userId);

    if (user.hasUsedFreeTrial) {
      throw new BadRequestException('Free trial has already been used.');
    }

    if (
      user.isSubscribed &&
      user.subscriptionType !== SubscriptionType.FREE_TIER
    ) {
      throw new BadRequestException('User is already on a paid subscription.');
    }

    // Start free trial (e.g., 30 days of Premium)
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30); // Add 30 days

    user.subscriptionType = SubscriptionType.PREMIUM;
    user.isSubscribed = true;
    user.subscriptionExpiresAt = trialEndDate;
    user.hasUsedFreeTrial = true;

    try {
      await this.userRepository.save(user);
      // Exclude sensitive fields if necessary before returning
      const {
        password,
        passwordResetOtp,
        passwordResetExpires,
        emailVerificationToken,
        emailVerificationExpires,
        ...safeUser
      } = user;
      return safeUser as User;
    } catch (error) {
      throw new InternalServerErrorException('Failed to start free trial.');
    }
  }

  assignMaturityRatingsBasedonAge(userAge: number) {
    if (userAge < 13) {
      return MaturityRatings.PG;
    }
    if (userAge >= 13 && userAge < 17) {
      return MaturityRatings.PG_13;
    }
    if (userAge >= 17 && userAge < 18) {
      return MaturityRatings.NC_17;
    }
    return MaturityRatings.R;
  }

  // findAll() {
  //   return `This action returns all user`;
  // }

  async findOne(id: string) {
    try {
      const user = await this.ensureUserProfile(id);
      return user;
    } catch (error) {
      throw new NotFoundException('User not found');
    }
  }

  remove(id: string) {
    return `This action removes user with id ${id}`;
  }

  async ensureUserProfile(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['profiles'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // If no profiles exist, create a default one and a kids one
      if (user.profiles.length === 0) {
        const defaultProfile = await this.createProfile(userId, {
          userId: user.id,
          profileName: user.firstName,
          maturityRatings: this.assignMaturityRatingsBasedonAge(
            differenceInYears(new Date(), user.dateOfBirth),
          ),
        });
        const defaultKidsProfile = await this.createProfile(userId, {
          userId: user.id,
          profileName: user.lastName + ' Kids',
          maturityRatings: MaturityRatings.PG,
        });
        user.profiles.push(defaultProfile);
        user.profiles.push(defaultKidsProfile);
        await this.userRepository.save(user);
      }

      return user;
    } catch (error) {
      throw new InternalServerErrorException(
        'Problem occurred while processing user profiles.',
        error,
      );
    }
  }

  async updateWatchHistory(
    profileId: string,
    updateWatchHistoryDto: UpdateWatchHistoryDto,
  ) {
    // console.log(profileId, updateWatchHistoryDto);
    try {
      let watchHistory = await this.watchHistoryRepository.findOne({
        where: {
          profileId,
          movieId: updateWatchHistoryDto.movieId,
        },
      });

      if (!watchHistory) {
        watchHistory = this.watchHistoryRepository.create({
          profileId,
          movieId: updateWatchHistoryDto.movieId,
          lastWatchedAt: new Date(),
          ...updateWatchHistoryDto,
        });
      } else {
        Object.assign(watchHistory, {
          lastWatchedAt: new Date(),
          ...updateWatchHistoryDto,
        });
      }

      return await this.watchHistoryRepository.save(watchHistory);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Something went wrong in updating watch history.',
        error,
      );
    }
  }

  async getWatchHistory(profileId: string) {
    try {
      const watchHistory = await this.watchHistoryRepository.find({
        where: { profileId },
        order: {
          isCompleted: 'ASC',
          lastWatchedAt: 'DESC',
        },
      });

      return watchHistory;
    } catch (error) {
      throw new InternalServerErrorException(
        'Something went wrong in fetching watch history.',
        error,
      );
    }
  }

  async clearWatchHistory(profileId: string) {
    try {
      await this.watchHistoryRepository.delete({ profileId });
      return { message: 'Watch history cleared successfully' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Something went wrong in clearing watch history.',
        error,
      );
    }
  }

  async deleteWatchHistoryEntry(profileId: string, movieId: string) {
    try {
      const result = await this.watchHistoryRepository.delete({
        profileId,
        movieId,
      });

      if (result.affected === 0) {
        throw new NotFoundException('Watch history entry not found');
      }

      return { message: 'Watch history entry deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in deleting watch history entry.',
        error,
      );
    }
  }

  async validateProfilePin(
    userId: string,
    profileId: string,
    pin: string,
  ): Promise<boolean> {
    try {
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
      });

      if (!profile) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

      // Check if the profile has a PIN set
      if (!profile.pin) {
        throw new BadRequestException('Profile does not have a PIN set');
      }

      const isPinValid = await compare(pin, profile.pin);
      if (!isPinValid) {
        throw new BadRequestException('Invalid PIN');
      }

      return true;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to validate profile PIN');
    }
  }

  async getAccountDetails(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['profiles'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Exclude password from the returned user object
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve account details.',
      );
    }
  }

  async updateAccountDetails(
    userId: string,
    updateAccountDto: UpdateAccountDto,
  ) {
    try {
      const user = await this.findOneById(userId);
      if (updateAccountDto.password) {
        // Hash the new password before saving
        updateAccountDto.password = await hash(updateAccountDto.password, 8);
      }
      Object.assign(user, updateAccountDto);
      const updatedUser = await this.userRepository.save(user);

      // Exclude password from the returned user object
      const { password, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword;
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Propagate 404 when user does not exist
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to update account details.',
      );
    }
  }

  async deleteAccount(userId: string) {
    try {
      const user = await this.findOneById(userId);
      await this.userRepository.remove(user);
      return { message: 'Account deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Propagate 404 when user does not exist
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete account.');
    }
  }

  async updateUser(userId: string, updateObj: Partial<User>) {
    try {
      // Ensure user exists and get current state
      const existing = await this.findOneById(userId);

      // Helper to normalize possible date inputs
      const normalizeDate = (value: unknown, fieldName: string): Date | null | undefined => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (value instanceof Date) return value;
        if (typeof value === 'string') {
          if (!isISO8601(value)) {
            throw new BadRequestException(`${fieldName} must be a valid ISO 8601 date-time string`);
          }
          const d = new Date(value);
          if (isNaN(d.getTime())) {
            throw new BadRequestException(`${fieldName} is not a parsable date`);
          }
          return d;
        }
        throw new BadRequestException(`${fieldName} must be a Date, ISO string, null, or undefined`);
      };

      // Email verification rules
      if (updateObj.isEmailVerified === true) {
        const effectiveEmail = updateObj.email ?? existing.email;
        if (!effectiveEmail || !isEmail(effectiveEmail)) {
          throw new BadRequestException('Valid email is required to set isEmailVerified=true');
        }
      }

      // Normalize date inputs if present
      const nextBillingDateNorm = normalizeDate(updateObj.nextBillingDate, 'nextBillingDate');
      const subscriptionExpiresAtNorm = normalizeDate(updateObj.subscriptionExpiresAt, 'subscriptionExpiresAt');

      // Compute effective subscription type and initial flags
      const effectiveType = updateObj.subscriptionType ?? existing.subscriptionType;
      let effectiveIsSubscribed = updateObj.isSubscribed ?? existing.isSubscribed;
      // Start with normalized date inputs (may be undefined)
      let effectiveNextBillingDate = nextBillingDateNorm ?? existing.nextBillingDate;
      let effectiveSubscriptionExpiresAt = subscriptionExpiresAtNorm ?? existing.subscriptionExpiresAt;

      // Switching semantics based on subscriptionType input
      if (updateObj.subscriptionType !== undefined) {
        if (updateObj.subscriptionType === SubscriptionType.FREE_TIER || updateObj.subscriptionType === SubscriptionType.FREEMIUM) {
          effectiveIsSubscribed = false;
          // Force nulls for non-recurring types
          updateObj.nextBillingDate = null;
          updateObj.subscriptionExpiresAt = null;
          // Reflect forced nulls in effective values
          effectiveNextBillingDate = null;
          effectiveSubscriptionExpiresAt = null;
        } else if (updateObj.subscriptionType === SubscriptionType.PREMIUM) {
          effectiveIsSubscribed = true;
          // Require dates in update when switching to PREMIUM
          const nb = nextBillingDateNorm ?? existing.nextBillingDate;
          const exp = subscriptionExpiresAtNorm ?? existing.subscriptionExpiresAt;
          if (!nb || !exp) {
            throw new BadRequestException('For PREMIUM, nextBillingDate and subscriptionExpiresAt are required');
          }
          // Keep effective values consistent
          effectiveNextBillingDate = nb;
          effectiveSubscriptionExpiresAt = exp;
        }
      }

      // Invariants
      if (effectiveIsSubscribed === false) {
        if (effectiveType === SubscriptionType.PREMIUM) {
          throw new BadRequestException('If isSubscribed=false, subscriptionType must be FREE_TIER or FREEMIUM');
        }
      } else if (effectiveIsSubscribed === true) {
        if (effectiveType !== SubscriptionType.PREMIUM) {
          throw new BadRequestException('If isSubscribed=true, subscriptionType must be PREMIUM');
        }
      }

      // Type-specific date requirements
      const now = new Date();
      if (effectiveType === SubscriptionType.FREE_TIER || effectiveType === SubscriptionType.FREEMIUM) {
        // Dates must be null for non-recurring types
        if ((effectiveNextBillingDate as any) !== null) {
          throw new BadRequestException('nextBillingDate must be null for FREE_TIER and FREEMIUM');
        }
        if ((effectiveSubscriptionExpiresAt as any) !== null) {
          throw new BadRequestException('subscriptionExpiresAt must be null for FREE_TIER and FREEMIUM');
        }
      } else if (effectiveType === SubscriptionType.PREMIUM) {
        // Dates required and future-dated
        if (!effectiveNextBillingDate) {
          throw new BadRequestException('nextBillingDate is required for PREMIUM');
        }
        if (!effectiveSubscriptionExpiresAt) {
          throw new BadRequestException('subscriptionExpiresAt is required for PREMIUM');
        }
        if (effectiveNextBillingDate.getTime() <= now.getTime()) {
          throw new BadRequestException('nextBillingDate must be in the future when isSubscribed=true');
        }
        if (effectiveSubscriptionExpiresAt.getTime() <= now.getTime()) {
          throw new BadRequestException('subscriptionExpiresAt must be in the future when isSubscribed=true');
        }
        if (effectiveSubscriptionExpiresAt.getTime() < effectiveNextBillingDate.getTime()) {
          throw new BadRequestException('subscriptionExpiresAt must be greater than or equal to nextBillingDate');
        }
      }

      // Apply normalized values into update object
      // Do not override forced nulls when switching away from PREMIUM
      if (nextBillingDateNorm !== undefined && updateObj.nextBillingDate !== null) {
        updateObj.nextBillingDate = nextBillingDateNorm as Date | null;
      }
      if (subscriptionExpiresAtNorm !== undefined && updateObj.subscriptionExpiresAt !== null) {
        updateObj.subscriptionExpiresAt = subscriptionExpiresAtNorm as Date | null;
      }
      // Ensure isSubscribed aligns with effective semantics (coercion for non-recurring types)
      updateObj.isSubscribed = effectiveIsSubscribed;

      // Persist update
      return await this.userRepository.update(userId, updateObj);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update user.');
    }
  }

  async findAllPaginated(query: PaginateQuery) {
    const paginateConfig: PaginateConfig<User> = {
      sortableColumns: ['dateCreated', 'dateUpdated', 'firstName', 'lastName', 'email', 'phoneNumber', 'role', 'subscriptionType', 'isSubscribed'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['firstName', 'lastName', 'email', 'phoneNumber'],
      defaultLimit: 10,
      filterableColumns: {
        role: true,
        subscriptionType: true,
        isSubscribed: true,
        hasUsedFreeTrial: true,
        // Support date range filtering
        dateCreated: [FilterOperator.GTE, FilterOperator.LTE],
      },
      select: [
        'id',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dateOfBirth',
        'subscriptionType',
        'isSubscribed',
        'subscriptionExpiresAt',
        'nextBillingDate',
        'hasUsedFreeTrial',
        'preferredGenres',
        'displayPicture',
        'role',
        'dateCreated',
        'dateUpdated',
      ],
    };

    return await paginate(query, this.userRepository, paginateConfig);
  }
}
