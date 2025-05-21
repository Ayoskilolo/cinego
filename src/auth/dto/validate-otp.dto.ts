import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ValidateOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}