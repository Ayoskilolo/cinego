import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

@ApiTags('Auth')
export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token',
    example: '1234567890',
  })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
