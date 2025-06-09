import { IsEnum, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { PaymentReason } from '../enum';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateTransactionDto {
  @ApiProperty({
    description: 'The amount for the transaction',
    example: 1000,
    minimum: 1,
  })
  @IsNumber()
  @Min(1) // Or your minimum transaction amount
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'The reason for the payment',
    enum: PaymentReason,
    example: PaymentReason.PREMIUM,
  })
  @IsEnum(PaymentReason)
  @IsNotEmpty()
  paymentReason: PaymentReason;
}
