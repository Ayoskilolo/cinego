import { IsNotEmpty, IsUUID, IsInt, Min, Max } from 'class-validator';

export class CreateReviewDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsNotEmpty()
  @IsUUID()
  movieId: string;
}
