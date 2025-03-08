import { Injectable, NotFoundException } from '@nestjs/common';
import { UtilService } from '../util/util.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentPartner } from './entities/payment-partner.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentPartner)
    private readonly paymentPartnerRepository: Repository<PaymentPartner>,
    private readonly utilService: UtilService,
  ) {}

async findPaymentProviderBySlug(slug: string) {
      try {
      return await this.paymentPartnerRepository.findOneOrFail({
        where: { slug },
      });
    } catch (error) {
      console.log(error);
      throw new NotFoundException('User does not exist');
    }
}
}
