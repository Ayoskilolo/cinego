import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { PaymentPartner } from './entities/payment-partner.entity';

@Injectable()
export class PaymentPartnerSeeder implements Seeder {
  constructor(
    @InjectRepository(PaymentPartner)
    private readonly paymentPartnerRepository: Repository<PaymentPartner>,
    private readonly logger = new Logger(PaymentPartnerSeeder.name),
  ) {}

  async seed(): Promise<any> {
    const isAlreadySeeded = !!(await this.paymentPartnerRepository.count());

    if (isAlreadySeeded) return;

    const paymentPartners = [
      { name: 'FlutterWave', slug: 'flutterwave', order: 1, isActive: true },
      { name: 'PayStack', slug: 'paystack', order: 2, isActive: false },
    ];

    for (const paymentPartner of paymentPartners) {
      const partner = this.paymentPartnerRepository.create(paymentPartner);

      try {
        await this.paymentPartnerRepository.save(partner);
      } catch (error) {
        this.logger.error('Unable to seed payment partner', error);
      }
    }
  }

  async drop(): Promise<any> {
    //No need to do anything.
  }
}
