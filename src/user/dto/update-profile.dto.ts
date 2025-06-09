import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaturityRatings } from '../enum/maturityRatings';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'New name for the profile',
    example: 'Teenager',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  profileName?: string;

  @ApiPropertyOptional({
    description: 'New maturity rating for the profile',
    enum: MaturityRatings,
    example: MaturityRatings.R,
  })
  @IsEnum(MaturityRatings)
  @IsOptional()
  maturityRatings?: MaturityRatings;

  @ApiPropertyOptional({
    description: 'New URL for the profile image',
    example: 'https://example.com/new-profile.png',
  })
  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @ApiPropertyOptional({
    description: 'New PIN for the profile lock (or empty to remove)',
    example: '4321',
  })
  @IsString()
  @IsOptional()
  pin?: string;
}
