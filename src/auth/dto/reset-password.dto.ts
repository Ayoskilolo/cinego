import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber('NG') // Or appropriate region code
  phoneNumber?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6) // Assuming OTP is 6 digits
  otp: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword: string;
}
