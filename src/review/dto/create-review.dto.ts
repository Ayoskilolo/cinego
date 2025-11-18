import { IsNotEmpty, IsUUID, IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({
    description: 'The rating given by the profile (1-5)',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    description: 'Optional text content for the review',
    example: 'Loved the pacing and the cinematography.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiProperty({
    description: 'The ID of the movie being reviewed',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsNotEmpty()
  @IsUUID()
  movieId: string;
}
