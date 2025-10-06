import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional, IsUUID } from 'class-validator'

export class CreateMovieNewsDto {
  @ApiProperty({ description: 'Title of the movie news' })
  @IsString()
  title: string

  @ApiProperty({ description: 'Content of the movie news' })
  @IsString()
  content: string

  @ApiProperty({ description: 'Author of the movie news', required: false })
  @IsOptional()
  @IsString()
  author?: string

  @ApiProperty({ description: 'Short description of the movie news', required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ description: 'ID of the related movie' })
  @IsUUID()
  movieId: string
}