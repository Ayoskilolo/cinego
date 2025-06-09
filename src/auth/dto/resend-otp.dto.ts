import { IsEmail, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'User email address (optional)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
