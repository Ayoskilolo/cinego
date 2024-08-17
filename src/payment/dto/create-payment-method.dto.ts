import { ObjectId } from 'typeorm';

export class CreatePaymentMethodDto {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  userId: ObjectId;
}
