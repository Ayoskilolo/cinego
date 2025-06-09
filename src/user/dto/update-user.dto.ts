import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger'; // Import ApiProperty

// This DTO is for updating user details. It inherits properties from CreateUserDto.
// Since CreateUserDto is currently empty (as it relies on SignUpDto for creation),
// this DTO is also effectively empty unless CreateUserDto is populated or properties
// are added directly here. For more specific updates (like account details or profile),
// dedicated DTOs (UpdateAccountDto, UpdateProfileDto) are used.
export class UpdateUserDto {}
