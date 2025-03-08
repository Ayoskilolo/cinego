import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentPartner } from './entities/payment-partner.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentPartner])],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
