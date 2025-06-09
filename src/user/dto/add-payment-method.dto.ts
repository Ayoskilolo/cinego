import { IsCreditCard, Matches, IsNumberString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddPaymentMethodDto {
  @ApiProperty({
    description: 'The credit card number',
    example: '4242424242424242',
  })
  @IsCreditCard()
  cardNumber: string;

  @ApiProperty({
    description: 'The expiry date of the card in MM/YY format',
    example: '12/25',
  })
  @Matches(/^\d{2}\/\d{2}$/, { message: 'Date must match pattern "##/##"' })
  expiryDate: string;

  @ApiProperty({
    description: 'The CVV of the card',
    example: '123',
    maxLength: 3,
  })
  @IsNumberString()
  @Length(0, 3)
  cvv: string;
}
