import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { ProvidersEntity } from './entities/providers.entity';

@Injectable()
export class ProvidersSeeder implements Seeder {
  constructor(
    @InjectRepository(ProvidersEntity)
    private readonly providersRepository: Repository<ProvidersEntity>,
  ) {}
  private readonly logger = new Logger(ProvidersSeeder.name);

  async seed(): Promise<any> {
    const existingCount = await this.providersRepository.count();
    this.logger.log(`Found ${existingCount} existing providers`);

    // change this to filter for duplicates when new providers are added
    if (existingCount > 0) {
      this.logger.log('Providers already seeded, skipping...');
      return;
    }

    const providers = [
      {
        name: 'Allrites',
        slug: 'allrites',
        isActive: true,
        baseUrl: 'https://content.allrites.com/api/ritestream',
      },
    ];

    for (const provider of providers) {
      const providerEntity = this.providersRepository.create(provider);

      try {
        const savedProvider =
          await this.providersRepository.save(providerEntity);
        this.logger.log(
          `Seeded provider: ${savedProvider.name} with ID: ${savedProvider.id}`,
        );
      } catch (error) {
        this.logger.error('Unable to seed provider', error);
      }
    }
  }

  drop(): Promise<any> {
    // No need to do anything.
    return;
  }
}
