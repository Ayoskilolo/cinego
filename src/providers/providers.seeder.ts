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
    const isAlreadySeeded = !!(await this.providersRepository.count());

    if (isAlreadySeeded) return;

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
        await this.providersRepository.save(providerEntity);
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
