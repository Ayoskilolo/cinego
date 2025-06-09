import { PartialType } from '@nestjs/mapped-types';
import { Profile } from '../entities/profile.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaturityRatings } from '../enum/maturityRatings';

export class CreateProfileDto extends PartialType(Profile) {
  @ApiProperty({
    description: 'Name of the profile',
    example: 'Kids',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  profileName: string;

  @ApiPropertyOptional({
    description: 'Maturity rating for the profile',
    enum: MaturityRatings,
    example: MaturityRatings.PG,
  })
  @IsEnum(MaturityRatings)
  @IsOptional()
  maturityRatings?: MaturityRatings;

  @ApiPropertyOptional({
    description: 'URL of the profile image',
    example: 'https://example.com/profile.jpg',
  })
  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @ApiPropertyOptional({
    description: 'PIN for profile lock (if any)',
    example: '1234',
  })
  @IsString()
  @IsOptional()
  pin?: string;
}
