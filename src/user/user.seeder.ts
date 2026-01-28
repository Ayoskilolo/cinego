import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Profile } from './entities/profile.entity';
import { faker } from '@faker-js/faker';
import { SubscriptionType } from './enum/userType';
import { MaturityRatings } from './enum/maturityRatings';
import { Role } from '../auth/enums/role.enum';
import { hash } from 'bcryptjs';

@Injectable()
export class UserSeeder implements Seeder {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly configService: ConfigService,
  ) {}
  private readonly logger = new Logger(UserSeeder.name);

  async seed(): Promise<any> {
    const existingUserCount = await this.userRepository.count();
    this.logger.log(`Found ${existingUserCount} existing users`);

    // Get admin credentials from environment variables
    const adminEmail = this.configService.get<string>('ADMIN_USER_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_USER_PASSWORD');

    if (!adminEmail) {
      throw new Error(
        'ADMIN_USER_EMAIL environment variable is required but not set',
      );
    }

    if (!adminPassword) {
      throw new Error(
        'ADMIN_USER_PASSWORD environment variable is required but not set',
      );
    }

    // Check if admin user already exists
    const existingAdmin = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      this.logger.log('Admin user already exists, skipping admin creation...');
    } else {
      // Create constant admin user
      try {
        // Hash the admin password
        const hashedPassword = await hash(adminPassword, 10);

        const adminUser: Partial<User> = {
          firstName: 'Admin',
          lastName: 'User',
          email: adminEmail,
          password: hashedPassword,
          isEmailVerified: true,
          phoneNumber: '+1234567890',
          dateOfBirth: new Date('1990-01-01'),
          preferredGenres: ['Action', 'Drama', 'Sci-Fi', 'Thriller'],
          displayPicture: 'https://picsum.photos/200/200?random=9999',
          subscriptionType: SubscriptionType.PREMIUM,
          isSubscribed: true,
          subscriptionExpiresAt: new Date('2025-12-31'),
          nextBillingDate: new Date('2025-01-01'),
          hasUsedFreeTrial: false,
          role: Role.ADMIN,
        };

        const adminEntity = this.userRepository.create(adminUser);
        const savedAdmin = await this.userRepository.save(adminEntity);
        this.logger.log(
          `Seeded admin user: ${savedAdmin.firstName} ${savedAdmin.lastName} (${savedAdmin.email})`,
        );

        // Create admin profile
        const adminProfile: Partial<Profile> = {
          userId: savedAdmin.id,
          profileName: 'Admin Profile',
          maturityRatings: MaturityRatings.R,
          profileImageUrl: 'https://picsum.photos/150/150?random=9999',
          pin: null, // No PIN for admin profile
        };

        const adminProfileEntity = this.profileRepository.create(adminProfile);
        const savedAdminProfile =
          await this.profileRepository.save(adminProfileEntity);
        this.logger.log(
          `Seeded admin profile: ${savedAdminProfile.profileName}`,
        );

        // // Set admin profile as active
        // await this.userRepository.update(savedAdmin.id, {
        //   activeProfileId: savedAdminProfile.id,
        // });
      } catch (error) {
        this.logger.error('Unable to seed admin user', error);
      }
    }

    // Only create random users if no users exist (excluding admin)
    if (existingUserCount === 0) {
      const numberOfUsers = 20; // Generate 20 users

      for (let i = 0; i < numberOfUsers; i++) {
        try {
          // Create user
          const userPassword = 'user123';
          const hashedUserPassword = await hash(userPassword, 10);

          const user: Partial<User> = {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email(),
            password: hashedUserPassword,
            isEmailVerified: faker.datatype.boolean(),
            phoneNumber: faker.phone.number(),
            dateOfBirth: faker.date.birthdate({
              min: 18,
              max: 65,
              mode: 'age',
            }),
            preferredGenres: faker.helpers.arrayElements(
              [
                'Action',
                'Adventure',
                'Comedy',
                'Drama',
                'Horror',
                'Romance',
                'Sci-Fi',
                'Thriller',
                'Mystery',
                'Fantasy',
                'Documentary',
                'Animation',
              ],
              faker.number.int({ min: 2, max: 5 }),
            ),
            displayPicture: `https://picsum.photos/200/200?random=${i + 3000}`,
            subscriptionType: faker.helpers.arrayElement([
              SubscriptionType.FREE_TIER,
              SubscriptionType.FREEMIUM,
              SubscriptionType.PREMIUM,
            ]),
            isSubscribed: faker.datatype.boolean(),
            hasUsedFreeTrial: faker.datatype.boolean(),
            role: faker.helpers.arrayElement([Role.USER, Role.ADMIN]),
          };

          // Set subscription dates if subscribed
          if (user.isSubscribed) {
            user.subscriptionExpiresAt = faker.date.future();
            user.nextBillingDate = faker.date.future();
          }

          const userEntity = this.userRepository.create(user);
          const savedUser = await this.userRepository.save(userEntity);
          this.logger.log(
            `Seeded user: ${savedUser.firstName} ${savedUser.lastName}`,
          );

          // Create 1-3 profiles for each user
          const numberOfProfiles = faker.number.int({ min: 1, max: 3 });

          for (let j = 0; j < numberOfProfiles; j++) {
            const profile: Partial<Profile> = {
              userId: savedUser.id,
              profileName: j === 0 ? 'Main Profile' : faker.person.firstName(),
              maturityRatings: faker.helpers.arrayElement([
                MaturityRatings.G,
                MaturityRatings.PG,
                MaturityRatings.PG_13,
                MaturityRatings.R,
                MaturityRatings.NC_17,
              ]),
              profileImageUrl: `https://picsum.photos/150/150?random=${i * 10 + j + 4000}`,
              pin: faker.datatype.boolean() ? faker.string.numeric(4) : null,
            };

            const profileEntity = this.profileRepository.create(profile);
            const savedProfile =
              await this.profileRepository.save(profileEntity);
            this.logger.log(
              `Seeded profile: ${savedProfile.profileName} for user ${savedUser.firstName}`,
            );
          }

          // Set the first profile as active
          const firstProfile = await this.profileRepository.findOne({
            where: { userId: savedUser.id },
          });
          // if (firstProfile) {
          //   await this.userRepository.update(savedUser.id, {
          //     activeProfileId: firstProfile.id,
          //   });
          // }
        } catch (error) {
          this.logger.error(`Unable to seed user ${i + 1}`, error);
        }
      }

      this.logger.log(
        `Successfully seeded ${numberOfUsers} users with profiles`,
      );
    }
  }

  drop(): Promise<any> {
    return this.userRepository.delete({});
  }
}
