import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBlogCommentDto {
  @ApiProperty({
    description:
      'The content of the comment (will be associated with the active profile)',
    example: 'Great blog post! Very informative.',
  })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiProperty({
    description: 'The ID of the blog post being commented on',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsNotEmpty()
  @IsUUID()
  blogId: string;
}
