import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException, // Added UnauthorizedException
} from '@nestjs/common';
import { hash, compare } from 'bcrypt';
import { differenceInYears, addMinutes, addHours } from 'date-fns'; // Added addHours
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Profile } from './entities/profile.entity';
import { UserExistsDto } from './dto/user-exists.dto';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { SubscriptionType } from './enum/userType';
import { PaymentService } from '../payment/payment.service';
import { MaturityRatings } from './enum/maturityRatings';
import { CreateProfileDto } from './dto/create-user.dto';
import { Genres } from '../movie/genres.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtService } from '@nestjs/jwt';
import { Not } from 'typeorm';
import {
  ProfileWithTokenResponse,
  ProfileResponse,
} from './interfaces/profile.interface';
import { WatchHistory } from './entities/watch-history.entity';
import { UpdateWatchHistoryDto } from './dto/update-watch-history.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto'; // Assuming you create this DTO

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(WatchHistory)
    private readonly watchHistoryRepository: Repository<WatchHistory>,
    private readonly paymentService: PaymentService,
    private readonly jwtService: JwtService,
  ) {}

  async createUser(createUserDto: SignUpDto) {
    // Check if email or phone number is provided.
    if (!createUserDto.email && !createUserDto.phoneNumber) {
      throw new BadRequestException('Email or phone number required');
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

      const userProfile = this.profileRepository.create(initialUserProfile);
      await this.profileRepository.save(userProfile);

      // Set this profile as active
      user.activeProfileId = userProfile.id;
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

  async deleteProfile(userId: string, profileId: string) {
    try {
      const user = await this.findOneById(userId);
      if (user.activeProfileId === profileId) {
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

  async switchProfile(userId: string, profileId: string) {
    try {
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
        relations: ['user'],
      });

      if (!profile || profile.user.id !== userId) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

      // Update the user's active profile
      await this.userRepository.update(userId, { activeProfileId: profileId });

      // Generate a new JWT token with the profile information
      const user = await this.findOneById(userId);
      const payload = {
        sub: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        activeProfileId: profileId,
      };

      // Note: You'll need to inject JwtService in the constructor
      const accessToken = await this.jwtService.signAsync(payload);

      return {
        profile,
        accessToken,
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

  async generatePasswordResetOtp(
    userId: string,
  ): Promise<{ otp: string; expires: Date }> {
    const user = await this.findOneById(userId);
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
    const expires = addMinutes(new Date(), 15); // OTP expires in 15 minutes

    user.passwordResetOtp = await hash(otp, 8); // Hash the OTP before saving
    user.passwordResetExpires = expires;

    try {
      await this.userRepository.save(user);
      return { otp, expires }; // Return the plain OTP for sending email
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to save password reset OTP.',
      );
    }
  }

  async resetPasswordWithOtp(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<User> {
    const { email, phoneNumber, otp, newPassword } = resetPasswordDto;

    if (!email && !phoneNumber) {
      throw new BadRequestException('Email or phone number is required');
    }

    let user: User;
    try {
      if (email) {
        user = await this.findOneByEmail(email);
      } else {
        user = await this.findOneByPhoneNumber(phoneNumber);
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

    try {
      await this.userRepository.save(user);
      return user;
    } catch (error) {
      throw new InternalServerErrorException('Failed to verify email.');
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
      const user = await this.ensureActiveProfile(id);
      // Get the active profile
      const activeProfile = user.profiles.find(
        (profile) => profile.id === user.activeProfileId,
      );

      if (activeProfile) {
        user['activeProfile'] = activeProfile;
      }

      return user;
    } catch (error) {
      throw new NotFoundException('User not found');
    }
  }

  remove(id: string) {
    return `This action removes user with id ${id}`;
  }

  async ensureActiveProfile(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['profiles'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // If no active profile is set, set the first profile as active
      if (!user.activeProfileId && user.profiles.length > 0) {
        user.activeProfileId = user.profiles[0].id;
        await this.userRepository.save(user);
      }

      // If no profiles exist, create a default one
      if (user.profiles.length === 0) {
        const defaultProfile = await this.createProfile(userId, {
          userId: user.id,
          profileName: user.firstName,
          maturityRatings: this.assignMaturityRatingsBasedonAge(
            differenceInYears(new Date(), user.dateOfBirth),
          ),
        });
        user.profiles.push(defaultProfile);
        user.activeProfileId = defaultProfile.id;
        await this.userRepository.save(user);
      }

      return user;
    } catch (error) {
      throw new InternalServerErrorException(
        'Problem occurred while processing active profile.',
        error,
      );
    }
  }

  async updateWatchHistory(
    userId: string,
    profileId: string,
    updateWatchHistoryDto: UpdateWatchHistoryDto,
  ) {
    try {
      // First verify that the profile belongs to the user
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
      });

      if (!profile) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

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
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in updating watch history.',
        error,
      );
    }
  }

  async getWatchHistory(userId: string, profileId: string) {
    try {
      // Verify profile ownership
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
      });

      if (!profile) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

      const watchHistory = await this.watchHistoryRepository.find({
        where: { profileId },
        order: {
          isCompleted: 'ASC',
          lastWatchedAt: 'DESC',
        },
      });

      return watchHistory;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in fetching watch history.',
        error,
      );
    }
  }

  async clearWatchHistory(userId: string, profileId: string) {
    try {
      // Verify profile ownership
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
      });

      if (!profile) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

      await this.watchHistoryRepository.delete({ profileId });
      return { message: 'Watch history cleared successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Something went wrong in clearing watch history.',
        error,
      );
    }
  }

  async deleteWatchHistoryEntry(
    userId: string,
    profileId: string,
    movieId: string,
  ) {
    try {
      // Verify profile ownership
      const profile = await this.profileRepository.findOne({
        where: { id: profileId, userId },
      });

      if (!profile) {
        throw new NotFoundException(
          'Profile not found or does not belong to user',
        );
      }

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
      throw new InternalServerErrorException('Failed to delete account.');
    }
  }

  async updateUser(userId, updateObj: Partial<User>) {
    return await this.userRepository.update(userId, updateObj);
  }
}
