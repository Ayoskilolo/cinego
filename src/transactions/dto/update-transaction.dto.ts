import { PartialType } from '@nestjs/mapped-types';
import { CreateTransactionDto } from './create-transaction.dto';
import { ApiProperty } from '@nestjs/swagger'; // Import ApiProperty

// This DTO is for updating transactions. It inherits properties from CreateTransactionDto.
// If there are specific properties that can be updated, they should be defined here.
// Since CreateTransactionDto is currently empty, this DTO is also effectively empty
// unless CreateTransactionDto is populated or properties are added directly here.
export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}
