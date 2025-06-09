import { PartialType } from '@nestjs/mapped-types';
import { CreateMovieDto } from './create-movie.dto';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMovieDto extends PartialType(CreateMovieDto) {
  // This DTO inherits from CreateMovieDto and makes all properties optional.
  // If CreateMovieDto is empty, this DTO will also effectively be empty.
  // Add specific properties for update if they differ from create, or ensure CreateMovieDto is populated.
}
