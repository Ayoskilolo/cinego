import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMovieNewsDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional() // Author might be optional or derived from authentication later
  author?: string;
}
