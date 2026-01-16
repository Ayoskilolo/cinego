import {
  IsEmail,
  IsMobilePhone,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'User email address (optional; required if phone number is not provided)',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => !o.phoneNumber)
  @IsNotEmpty({ message: 'Email is required when phone number is not provided.' })
  email?: string;

  @ApiPropertyOptional({
    example: '08012345678',
    description: 'User phone number (optional; required if email is not provided)',
    required: false,
  })
  @IsOptional()
  @IsMobilePhone('en-NG')
  @ValidateIf((o) => !o.email)
  @IsNotEmpty({ message: 'Phone number is required when email is not provided.' })
  phoneNumber?: string;

  @ApiProperty({ example: 'P@$$wOrd', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
