import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaturityRatings } from '../enum/maturityRatings';

export class UpdateProfileDto {
  @IsString()
  @MaxLength(50)
  @IsOptional()
  profileName?: string;

  @IsEnum(MaturityRatings)
  @IsOptional()
  maturityRatings?: MaturityRatings;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @IsString()
  @IsOptional()
  pin?: string;
}
