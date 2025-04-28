import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty({ message: 'Email address should not be empty.' })
  email: string;
}