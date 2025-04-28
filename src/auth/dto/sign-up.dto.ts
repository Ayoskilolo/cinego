import {
  IsDateString,
  IsEmail,
  IsMobilePhone,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import { MaturityRatings } from '../../user/enum/maturityRatings';

export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty({ message: 'Email address is required.' })
  email: string;

  @IsMobilePhone('en-NG')
  @IsOptional()
  phoneNumber?: string;

  @IsDateString()
  dateOfBirth: Date;

  @IsString()
  @IsNotEmpty()
  password: string;

  // Profile details
  @IsString()
  @IsOptional()
  profileName?: string;

  @IsEnum(MaturityRatings)
  @IsOptional()
  maturityRatings?: MaturityRatings;
}
