import { Injectable } from '@nestjs/common';
import { UtilService } from '../util/util.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    private readonly utilService: UtilService,
  ) {}

  async create({
    cardNumber,
    cvv,
    expiryDate,
    userId,
  }: CreatePaymentMethodDto) {
    const encryptedPaymentMethod: CreatePaymentMethodDto = {
      cardNumber: await this.utilService.encrypt(cardNumber),
      expiryDate: await this.utilService.encrypt(expiryDate),
      cvv: await this.utilService.encrypt(cvv),
      userId,
    };

    const paymentMethod = this.paymentMethodRepository.create(
      encryptedPaymentMethod,
    );

    return await this.paymentMethodRepository.save(paymentMethod);
  }
}
