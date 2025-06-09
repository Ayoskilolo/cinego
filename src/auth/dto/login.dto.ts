import {
  IsEmail,
  IsMobilePhone,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (optional if phone number is provided)',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: '08012345678',
    description: 'User phone number (optional if email is provided)',
    required: false,
  })
  @IsMobilePhone('en-NG')
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ example: 'P@$$wOrd', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
