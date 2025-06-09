import { PartialType } from '@nestjs/mapped-types';
import { CreateMovieNewsDto } from './create-movie-news.dto';
import { ApiProperty } from '@nestjs/swagger'; // Import ApiProperty

// Add a comment indicating that properties from CreateMovieNewsDto are inherited
// and will be documented via that DTO. If there are additional properties specific
// to updating, they should be added and documented here.
export class UpdateMovieNewsDto extends PartialType(CreateMovieNewsDto) {}
