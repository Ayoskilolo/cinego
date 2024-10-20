import { PartialType } from '@nestjs/mapped-types';
import { Profile } from '../entities/profile.entity';

export class CreateUserDto {}

export class CreateProfileDto extends PartialType(Profile) {}
