import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { In, Repository } from 'typeorm';
import { SessionEntity } from './entities/session.entity';
import { User } from '../user/entities/user.entity';
import { Profile } from '../user/entities/profile.entity';
import * as bcrypt from 'bcryptjs';
import { addDays, subDays } from 'date-fns';
import { faker } from '@faker-js/faker';

@Injectable()
export class SessionSeeder implements Seeder {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  private readonly logger = new Logger(SessionSeeder.name);

  async seed(): Promise<any> {
    const users = await this.userRepository.find({ relations: ['profiles'] });

    // Reset existing sessions to avoid unbounded growth
    await this.sessionRepository.delete({});

    let totalSessions = 0;
    const sessionsToCreate: Partial<SessionEntity>[] = [];

    for (const user of users) {
      if (!user.profiles || user.profiles.length === 0) {
        this.logger.warn(
          `User ${user.email || user.id} has no profiles; skipping session creation.`,
        );
        continue;
      }

      const sessionCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < sessionCount; i++) {
        const profile = faker.helpers.arrayElement(user.profiles);

        // Randomize state
        const roll = faker.number.int({ min: 1, max: 100 });
        const isLoggedOut = roll <= 35; // 35%
        const hasExpiredAccess = !isLoggedOut && roll > 35 && roll <= 55; // 20%
        const hasExpiredRefresh = !isLoggedOut && roll > 55 && roll <= 75; // 20%

        const now = new Date();
        const expiresAt = hasExpiredAccess
          ? subDays(now, faker.number.int({ min: 1, max: 30 }))
          : addDays(now, faker.number.int({ min: 1, max: 60 }));

        let refreshTokenHash: string = null;
        let refreshTokenExpiresAt: Date = null;

        if (!isLoggedOut) {
          const rawRefreshToken = faker.string.uuid();
          refreshTokenHash = await bcrypt.hash(rawRefreshToken, 10);
          refreshTokenExpiresAt = hasExpiredRefresh
            ? subDays(now, faker.number.int({ min: 1, max: 30 }))
            : addDays(now, faker.number.int({ min: 1, max: 60 }));
        }

        const session: Partial<SessionEntity> = {
          userId: user.id,
          currentProfileId: profile.id,
          ipAddress: faker.internet.ipv4(),
          userAgent: faker.internet.userAgent(),
          isActive: !isLoggedOut,
          expiresAt,
          refreshTokenHash: isLoggedOut ? null : refreshTokenHash,
          refreshTokenExpiresAt: isLoggedOut ? null : refreshTokenExpiresAt,
          loggedOutAt: isLoggedOut
            ? subDays(now, faker.number.int({ min: 0, max: 30 }))
            : null,
        };

        sessionsToCreate.push(session);
        totalSessions++;
      }

      this.logger.log(
        `Prepared ${sessionCount} sessions for user ${user.email || user.id}`,
      );
    }

    if (sessionsToCreate.length) {
      await this.sessionRepository.save(
        this.sessionRepository.create(sessionsToCreate),
      );
    }

    this.logger.log(
      `Created ${totalSessions} sessions across ${users.length} users.`,
    );
  }

  async drop(): Promise<any> {
    return this.sessionRepository.delete({});
  }
}
