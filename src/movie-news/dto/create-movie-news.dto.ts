import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMovieNewsDto {
  @ApiProperty({
    description: 'The title of the movie news article',
    example: 'Upcoming Blockbuster Release',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The main content of the movie news article',
    example: 'Lorem ipsum dolor sit amet...',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description: 'The author of the movie news article',
    example: 'Jane Doe',
  })
  @IsString()
  @IsOptional() // Author might be optional
  author?: string;

  @ApiPropertyOptional({
    description: 'A short description or summary of the news article',
    example: 'A new movie is set to release next month.',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
