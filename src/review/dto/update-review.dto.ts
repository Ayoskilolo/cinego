import { IsNotEmpty, IsInt, Min, Max } from 'class-validator';

export class UpdateReviewDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
}
