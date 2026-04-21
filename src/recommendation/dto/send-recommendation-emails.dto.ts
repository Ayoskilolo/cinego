import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID, ArrayNotEmpty } from 'class-validator';

export class SendRecommendationEmailsDto {
  @ApiPropertyOptional({
    description:
      'Specific user IDs to send emails to. Omit to send to all verified users.',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'userIds array must not be empty. Omit the field to send to all users.' })
  @IsUUID('4', { each: true, message: 'Each userId must be a valid UUID' })
  userIds?: string[];
}
