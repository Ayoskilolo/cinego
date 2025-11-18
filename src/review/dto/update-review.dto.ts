import { IsOptional, IsInt, Min, Max, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateReviewDto {
  @ApiProperty({
    description: 'The updated rating given by the user (1-5)',
    example: 4,
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({
    description: 'Optional updated text content for the review',
    example: 'After rewatching, I appreciated the editing more.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}
