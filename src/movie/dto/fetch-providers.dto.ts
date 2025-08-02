import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class FetchFromProvidersResponseDto {
  @ApiProperty({
    description: 'Success message',
    example:
      'Successfully fetched movies from providers. Added 50 new movies, skipped 10 duplicates.',
  })
  message: string;

  @ApiProperty({
    description: 'Number of new movies added',
    example: 50,
  })
  newMovies: number;

  @ApiProperty({
    description: 'Number of duplicate movies skipped',
    example: 10,
  })
  skippedDuplicates: number;
}

export class FetchFromSpecificProviderResponseDto {
  @ApiProperty({
    description: 'Success message',
    example:
      'Successfully fetched movies from Allrites. Added 25 new movies, skipped 5 duplicates.',
  })
  message: string;

  @ApiProperty({
    description: 'Provider name',
    example: 'Allrites',
  })
  provider: string;

  @ApiProperty({
    description: 'Number of new movies added',
    example: 25,
  })
  newMovies: number;

  @ApiProperty({
    description: 'Number of duplicate movies skipped',
    example: 5,
  })
  skippedDuplicates: number;
}

export class FetchFromProvidersQueryDto {
  @ApiProperty({
    description:
      'Provider ID to fetch from (optional - if not provided, fetches from all active providers)',
    required: false,
    example: 'provider-uuid-here',
  })
  @IsOptional()
  @IsString()
  providerId?: string;
}
