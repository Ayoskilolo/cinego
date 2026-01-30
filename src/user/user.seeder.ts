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
      this.logger.log(
        'Admin user already exists, ensuring multiple profiles...',
      );
      const now = new Date();
      const exp = new Date(now.getTime());
      exp.setMonth(exp.getMonth() + 1);
      const next = new Date(now.getTime());
      next.setMonth(next.getMonth() + 1);
      try {
        const existingProfiles = await this.profileRepository.find({
          where: { userId: existingAdmin.id },
        });
        const needProfiles = [
          {
            profileName: 'Admin Main',
            maturityRatings: MaturityRatings.R,
            profileImageUrl: 'https://picsum.photos/150/150?random=9999',
          },
          {
            profileName: 'Admin Guest',
            maturityRatings: MaturityRatings.PG_13,
            profileImageUrl: 'https://picsum.photos/150/150?random=9998',
          },
          {
            profileName: 'Admin Child',
            maturityRatings: MaturityRatings.PG,
            profileImageUrl: 'https://picsum.photos/150/150?random=9997',
          },
        ];
        const have = new Set(
          (existingProfiles || []).map((p) =>
            (p.profileName || '').toLowerCase(),
          ),
        );
        for (const prof of needProfiles) {
          if (!have.has(prof.profileName.toLowerCase())) {
            const entity = this.profileRepository.create({
              userId: existingAdmin.id,
              profileName: prof.profileName,
              maturityRatings: prof.maturityRatings,
              profileImageUrl: prof.profileImageUrl,
              pin: null,
            });
            const saved = await this.profileRepository.save(entity);
            this.logger.log(`Seeded admin profile: ${saved.profileName}`);
          }
        }
      } catch (error) {
        this.logger.error('Unable to ensure admin profiles', error);
      }
      try {
        const admin = await this.userRepository.findOne({
          where: { id: existingAdmin.id },
        });
        if (
          admin &&
          admin.subscriptionType === SubscriptionType.PREMIUM &&
          (!admin.subscriptionExpiresAt || admin.subscriptionExpiresAt <= now)
        ) {
          await this.userRepository.update(admin.id, {
            subscriptionExpiresAt: exp,
            nextBillingDate: next,
            isSubscribed: true,
          });
        }
      } catch {}
    } else {
      // Create constant admin user
      try {
        // Hash the admin password
        const hashedPassword = await hash(adminPassword, 10);

        const now = new Date();
        const exp = new Date(now.getTime());
        exp.setMonth(exp.getMonth() + 1);
        const next = new Date(now.getTime());
        next.setMonth(next.getMonth() + 1);
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
          subscriptionExpiresAt: exp,
          nextBillingDate: next,
          role: Role.ADMIN,
        };

        const adminEntity = this.userRepository.create(adminUser);
        const savedAdmin = await this.userRepository.save(adminEntity);
        this.logger.log(
          `Seeded admin user: ${savedAdmin.firstName} ${savedAdmin.lastName} (${savedAdmin.email})`,
        );

        const adminProfiles: Partial<Profile>[] = [
          {
            userId: savedAdmin.id,
            profileName: 'Admin Main',
            maturityRatings: MaturityRatings.R,
            profileImageUrl: 'https://picsum.photos/150/150?random=9999',
            pin: null,
          },
          {
            userId: savedAdmin.id,
            profileName: 'Admin Guest',
            maturityRatings: MaturityRatings.PG_13,
            profileImageUrl: 'https://picsum.photos/150/150?random=9998',
            pin: null,
          },
          {
            userId: savedAdmin.id,
            profileName: 'Admin Child',
            maturityRatings: MaturityRatings.PG,
            profileImageUrl: 'https://picsum.photos/150/150?random=9997',
            pin: null,
          },
        ];

        for (const prof of adminProfiles) {
          const entity = this.profileRepository.create(prof);
          const saved = await this.profileRepository.save(entity);
          this.logger.log(`Seeded admin profile: ${saved.profileName}`);
        }

        // // Set admin profile as active
        // await this.userRepository.update(savedAdmin.id, {
        //   activeProfileId: savedAdminProfile.id,
        // });
      } catch (error) {
        this.logger.error('Unable to seed admin user', error);
      }
    }

    try {
      const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
      if (nodeEnv !== 'development') {
        this.logger.log(
          `Skipping premium user seeding because NODE_ENV="${process.env.NODE_ENV}" is not "development".`,
        );
        return;
      }
      const premiumEmail = 'premiumuser@cinego.com';
      const existingPremium = await this.userRepository.findOne({
        where: { email: premiumEmail },
      });
      if (!existingPremium) {
        const hashedPremiumPassword = await hash('password123', 10);
        const now = new Date();
        const exp = new Date(now.getTime());
        exp.setMonth(exp.getMonth() + 1);
        const next = new Date(now.getTime());
        next.setMonth(next.getMonth() + 1);
        const premiumUser: Partial<User> = {
          firstName: 'Premium',
          lastName: 'User',
          email: premiumEmail,
          password: hashedPremiumPassword,
          isEmailVerified: true,
          phoneNumber: '+1234567800',
          dateOfBirth: new Date('1992-05-15'),
          preferredGenres: ['Action', 'Drama', 'Sci-Fi'],
          displayPicture: 'https://picsum.photos/200/200?random=8888',
          subscriptionType: SubscriptionType.PREMIUM,
          isSubscribed: true,
          subscriptionExpiresAt: exp,
          nextBillingDate: next,
          hasUsedFreeTrial: false,
          role: Role.USER,
        };
        const premiumEntity = this.userRepository.create(premiumUser);
        const savedPremium = await this.userRepository.save(premiumEntity);
        this.logger.log(`Seeded premium user: ${savedPremium.email}`);
        const premiumProfiles: Partial<Profile>[] = [
          {
            userId: savedPremium.id,
            profileName: 'Premium Main',
            maturityRatings: MaturityRatings.R,
            profileImageUrl: 'https://picsum.photos/150/150?random=8889',
            pin: null,
          },
          {
            userId: savedPremium.id,
            profileName: 'Premium Guest',
            maturityRatings: MaturityRatings.PG_13,
            profileImageUrl: 'https://picsum.photos/150/150?random=8890',
            pin: null,
          },
          {
            userId: savedPremium.id,
            profileName: 'Premium Child',
            maturityRatings: MaturityRatings.PG,
            profileImageUrl: 'https://picsum.photos/150/150?random=8891',
            pin: null,
          },
        ];
        for (const prof of premiumProfiles) {
          const entity = this.profileRepository.create(prof);
          const saved = await this.profileRepository.save(entity);
          this.logger.log(`Seeded premium profile: ${saved.profileName}`);
        }
      }
    } catch (error) {
      this.logger.error('Unable to seed premium user', error);
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
