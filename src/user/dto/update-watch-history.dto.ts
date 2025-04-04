import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateWatchHistoryDto {
  @IsString()
  movieId: string;

  @IsNumber()
  @Min(0)
  watchDurationInSeconds: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  watchProgress: number;

  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;
}
