import { Controller, Get, Post, Body, Res, HttpCode, HttpStatus } from '@nestjs/common'
import { AwsServicesService } from './aws-services.service';
import { Public } from 'src/auth/auth.decorator';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config';

@ApiTags('aws-services')
@Controller('aws-services')
export class AwsServicesController {
  constructor(
    private readonly awsServicesService: AwsServicesService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('list-buckets')
  async listBuckets() {
    return this.awsServicesService.listBuckets();
  }

  @Public()
  @Get('show-movies-in-bucket')
  async showMoviesInBucket() {
    return this.awsServicesService.showMoviesInBucket();
  }

  @Public()
  @Get('get-presigned-url-for-movie')
  async getPresignedUrlForMovie() {
    return this.awsServicesService.getPresignedUrlForMovie();
  }

  @Public()
  @Post('cloudfront/signed-cookies')
  @ApiOperation({ summary: 'Generate CloudFront signed cookies for a given path/scope' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', example: '/' },
        ttlSeconds: { type: 'number', example: 900 },
      },
      required: ['scope', 'ttlSeconds'],
    },
    description: 'Path scope (e.g., / or /protected/*) and TTL in seconds (capped at 3600)'
  })
  @ApiResponse({ status: 200, description: 'Cookies set successfully.' })
  async getCloudFrontSignedCookies(
    @Body('scope') scope: string,
    @Body('ttlSeconds') ttlSeconds: number,
    @Res({ passthrough: true }) res: any,
  ) {
    const { cookies, expires } = await this.awsServicesService.getCloudFrontSignedCookies(scope, ttlSeconds);

    // Relax cookie attributes in non-production to allow setting over http during local testing
    const nodeEnv = this.configService.get<string>('app.nodeEnvironment') || process.env.NODE_ENV;
    const isProd = nodeEnv === 'production';

    const baseParts = [
      'HttpOnly',
      // Domain is intentionally omitted for localhost/testing; include a parent domain like .cinego.live in production via a reverse proxy or config
      'Path=/',
      `Expires=${expires.toUTCString()}`,
    ];

    if (isProd) {
      baseParts.unshift('Secure');
      baseParts.push('SameSite=None');
    }

    const base = baseParts.join('; ');

    res.setHeader('Set-Cookie', [
      `CloudFront-Policy=${cookies['CloudFront-Policy']}; ${base}`,
      `CloudFront-Signature=${cookies['CloudFront-Signature']}; ${base}`,
      `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}; ${base}`,
    ]);

    return { message: 'Cookies set' };
  }
}
