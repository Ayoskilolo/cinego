import {
  IsDateString,
  IsEmail,
  IsMobilePhone,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaturityRatings } from '../../user/enum/maturityRatings';

export class SignUpDto {
  @ApiProperty({ example: 'John', description: 'User first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty({ message: 'Email address is required.' })
  email: string;

  @ApiPropertyOptional({
    example: '08012345678',
    description: 'User phone number (optional)',
  })
  @IsMobilePhone('en-NG')
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ example: '1990-01-15', description: 'User date of birth' })
  @IsDateString()
  dateOfBirth: Date;

  @ApiProperty({ example: 'P@$$wOrd', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  // Profile details
  @ApiPropertyOptional({
    example: 'Johnny',
    description: 'User profile name (optional)',
  })
  @IsString()
  @IsOptional()
  profileName?: string;

  @ApiPropertyOptional({
    enum: MaturityRatings,
    example: MaturityRatings.R,
    description: 'User maturity rating for profile (optional)',
  })
  @IsEnum(MaturityRatings)
  @IsOptional()
  maturityRatings?: MaturityRatings;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'User profile picture (optional)',
  })
  profilePicture?: Express.Multer.File; // This field is handled by FileInterceptor, type is for Swagger only
}
