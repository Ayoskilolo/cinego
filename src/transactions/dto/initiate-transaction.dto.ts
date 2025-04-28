import { IsEnum, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { PaymentReason } from '../enum';

export class InitiateTransactionDto {
  @IsNumber()
  @Min(1) // Or your minimum transaction amount
  @IsNotEmpty()
  amount: number;

  @IsEnum(PaymentReason)
  @IsNotEmpty()
  paymentReason: PaymentReason;
}
