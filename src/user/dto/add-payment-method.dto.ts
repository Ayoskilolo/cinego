import { IsCreditCard, Matches, IsNumberString, Length } from 'class-validator';

export class AddPaymentMethodDto {
  @IsCreditCard()
  cardNumber: string;

  @Matches(/^\d{2}\/\d{2}$/, { message: 'Date must match pattern "##/##"' })
  expiryDate: string;

  @IsNumberString()
  @Length(0, 3)
  cvv: string;
}
