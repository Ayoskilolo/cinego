import { PartialType } from '@nestjs/mapped-types'
import { CreateMovieNewsDto } from './create-movie-news.dto'

export class UpdateMovieNewsDto extends PartialType(CreateMovieNewsDto) {}