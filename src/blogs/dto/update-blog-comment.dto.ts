import { PartialType } from '@nestjs/mapped-types';
import { CreateBlogCommentDto } from './create-blog-comment.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateBlogCommentDto extends PartialType(CreateBlogCommentDto) {
  @ApiPropertyOptional({
    description: 'The updated content of the comment',
    example: 'Updated comment content',
  })
  @IsOptional()
  @IsString()
  content?: string;
}
