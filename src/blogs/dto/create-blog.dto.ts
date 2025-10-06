import { IsString, IsNotEmpty, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateBlogDto {
  @ApiProperty({ description: 'The title of the blog', example: 'Upcoming Blockbuster Release' })
  @IsString()
  @IsNotEmpty()
  title: string

  @ApiProperty({ description: 'The main content of the blog', example: 'Lorem ipsum dolor sit amet...' })
  @IsString()
  @IsNotEmpty()
  content: string

  @ApiPropertyOptional({ description: 'The author of the blog', example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  author?: string

  @ApiPropertyOptional({ description: 'A short description or summary of the blog', example: 'A new movie is set to release next month.' })
  @IsString()
  @IsOptional()
  description?: string
}
