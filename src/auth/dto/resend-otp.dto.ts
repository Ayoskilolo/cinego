import { IsEmail, IsOptional } from 'class-validator';

export class ResendOtpDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}
