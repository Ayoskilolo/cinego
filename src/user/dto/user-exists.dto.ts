import { IsEmail, IsMobilePhone, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserExistsDto {
  @ApiPropertyOptional({
    example: 'user@example.com',
    description:
      'User email address (required if phone number is not provided)',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: '08012345678',
    description: 'User phone number (required if email is not provided)',
  })
  @IsMobilePhone('en-NG')
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: 'username123',
    description: 'Username to check for existence (optional)',
  })
  @IsString()
  @IsOptional()
  username?: string;
}
