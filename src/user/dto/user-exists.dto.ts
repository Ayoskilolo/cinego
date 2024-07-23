import { IsEmail, IsMobilePhone, IsOptional } from 'class-validator';

export class UserExistsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsMobilePhone('en-NG')
  phoneNumber?: string;
}
