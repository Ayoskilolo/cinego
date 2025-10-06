import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import { PaymentChannel, PaymentReason, TransactionStatus } from './enum';
import { faker } from '@faker-js/faker';

@Injectable()
export class TransactionsSeeder implements Seeder {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private readonly logger = new Logger(TransactionsSeeder.name);

  async seed(): Promise<any> {
    // Config with sensible defaults for the requested use-case
    const DAYS = Number.parseInt(process.env.TX_SEED_DAYS || '365');
    // Backwards compat: TX_SEED_PER_DAY is interpreted as the minimum when provided
    const PER_DAY_MIN = Number.parseInt(
      process.env.TX_SEED_PER_DAY_MIN || process.env.TX_SEED_PER_DAY || '15',
    );
    const PER_DAY_MAX = Number.parseInt(
      process.env.TX_SEED_PER_DAY_MAX || String(Math.max(PER_DAY_MIN, 45)),
    );
    const PER_DAY_HARD_MAX = Number.parseInt(
      process.env.TX_SEED_PER_DAY_HARD_MAX || '200',
    );
    const SPIKE_CHANCE = Number.parseFloat(
      process.env.TX_SEED_SPIKE_CHANCE || '0.25',
    );
    const SPIKE_MULTIPLIER_MIN = Number.parseFloat(
      process.env.TX_SEED_SPIKE_MULTIPLIER_MIN || '2.0',
    );
    const SPIKE_MULTIPLIER_MAX = Number.parseFloat(
      process.env.TX_SEED_SPIKE_MULTIPLIER_MAX || '5.0',
    );

    const START_DATE = process.env.TX_SEED_START_DATE; // ISO string or yyyy-mm-dd
    const USER_IDS = (process.env.TX_SEED_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const baseNow = START_DATE ? new Date(START_DATE) : new Date();

    const users = await this.userRepository.find({ select: ['id', 'email'] });
    const filteredUsers = USER_IDS.length
      ? users.filter((u) => USER_IDS.includes(String(u.id)))
      : users;

    if (filteredUsers.length === 0) {
      this.logger.warn('No users found (after filtering). Skipping transactions seeding.');
      return;
    }

    this.logger.log(
      `Seeding transactions with config: DAYS=${DAYS}, PER_DAY_MIN=${PER_DAY_MIN}, PER_DAY_MAX=${PER_DAY_MAX}, SPIKE_CHANCE=${SPIKE_CHANCE}, START_DATE=${
        START_DATE || 'now'
      }, USER_IDS=${USER_IDS.join(',') || 'all'}`,
    );

    const toSave: Partial<Transaction>[] = [];
    const countsByDay: number[] = [];

    for (let d = 0; d < DAYS; d++) {
      const baseDate = new Date(baseNow);
      baseDate.setDate(baseNow.getDate() - d);
      baseDate.setHours(0, 0, 0, 0); // anchor to start of day

      // Draw baseline per-day count and optionally apply a spike multiplier
      let perDayCount = faker.number.int({ min: PER_DAY_MIN, max: PER_DAY_MAX });
      const spike = Math.random() < SPIKE_CHANCE;
      if (spike) {
        // Use a multiplier to occasionally create significantly higher volumes
        const spikeMult = faker.number.float({ min: SPIKE_MULTIPLIER_MIN, max: SPIKE_MULTIPLIER_MAX });
        perDayCount = Math.min(Math.floor(perDayCount * spikeMult), PER_DAY_HARD_MAX);
      }
      countsByDay.push(perDayCount);

      for (let i = 0; i < perDayCount; i++) {
        const user = faker.helpers.arrayElement(filteredUsers);
        const reason = faker.helpers.arrayElement([
          PaymentReason.PREMIUM,
          PaymentReason.FREEMIUM,
        ]);
        const status = faker.helpers.arrayElement([
          TransactionStatus.PENDING,
          TransactionStatus.SUCCESSFUL,
          TransactionStatus.FAILED,
        ]);

        const amount =
          reason === PaymentReason.PREMIUM
            ? 4000
            : 100;
 
         const tx: Partial<Transaction> = {
           amount,
           reference: uuidv4(),
           externalId: null,
           externalReference: null,
           paymentReason: reason,
           paymentChanel: PaymentChannel.FLUTTERWAVE,
           status,
           verificationAttempts: 0,
           lastVerificationAttemptAt: null,
           userId: user.id,
         };

        toSave.push(tx);
      }
    }

    // Insert all transactions first
    const created = await this.transactionRepository.save(
      toSave.map((t) => this.transactionRepository.create(t)),
      { chunk: 100 },
    );

    // Update their dateCreated/dateUpdated to distribute within each day (random minutes)
    let index = 0;
    for (let d = 0; d < DAYS; d++) {
      const baseDate = new Date(baseNow);
      baseDate.setDate(baseNow.getDate() - d);
      baseDate.setHours(0, 0, 0, 0);

      const perDayCount = countsByDay[d] || 0;
      for (let i = 0; i < perDayCount && index < created.length; i++) {
        const minutes = faker.number.int({ min: 0, max: 24 * 60 - 1 });
        const createdAt = new Date(baseDate.getTime() + minutes * 60 * 1000);
        await this.transactionRepository.update(created[index].id, {
          // @ts-ignore - override CreateDateColumn/UpdateDateColumn for deterministic e2e
          dateCreated: createdAt as any,
          // @ts-ignore
          dateUpdated: createdAt as any,
        });
        index++;
      }
    }

    this.logger.log(
      `Seeded ${created.length} transactions over ${DAYS} day(s). Min/day=${PER_DAY_MIN}, max/day≈${PER_DAY_HARD_MAX} with spikes.`,
    );
  }

  async drop(): Promise<any> {
    await this.transactionRepository.delete({});
    this.logger.log('Dropped all transactions');
  }
}