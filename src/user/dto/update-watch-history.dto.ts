import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWatchHistoryDto {
  @ApiProperty({
    description: 'ID of the movie being watched',
    example: 'm1o2v3i4-e5i6-d7s8-t9r0-ing1234567',
  })
  @IsString()
  movieId: string;

  @ApiProperty({
    description: 'Duration watched in seconds',
    example: 1800,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  watchDurationInSeconds: number;

  @ApiProperty({
    description: 'Watch progress percentage (0-100)',
    example: 50,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  watchProgress: number;

  @ApiPropertyOptional({
    description: 'Indicates if the movie watching is completed',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;
}
