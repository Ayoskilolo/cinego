import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AwsServicesService } from './aws-services.service';
import { Public } from 'src/auth/auth.decorator';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { normalizeScope } from 'src/helpers';

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
  @ApiOperation({
    summary: 'Generate CloudFront signed cookies for a given path/scope',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', example: '/' },
        ttlSeconds: { type: 'number', example: 900 },
      },
      required: ['scope', 'ttlSeconds'],
    },
    description:
      'Path scope (e.g., / or /protected/*) and TTL in seconds (capped at 3600)',
  })
  @ApiResponse({ status: 200, description: 'Cookies set successfully.' })
  async getCloudFrontSignedCookies(
    @Body('scope') scope: string,
    @Body('ttlSeconds') ttlSeconds: number,
    @Res({ passthrough: true }) res: any,
  ) {
    const { cookies, expires, ttl } =
      await this.awsServicesService.getCloudFrontSignedCookies(
        scope,
        ttlSeconds,
      );

    const domain = '.cinego.live'; // <-- IMPORTANT: parent domain

    const { cookiePath } = normalizeScope(scope);

    // const path = '/fast-6/'; // <-- match your HLS folder (or '/')
    const cookieAttrs = [
      `Domain=${domain}`,
      `Path=${cookiePath}`,
      'Secure', // required with SameSite=None
      'HttpOnly', // JS can’t read; still sent on requests
      'SameSite=None', // allows cross-site requests
      `Max-Age=${ttl}`, // or omit to make session cookies (AWS rec.)
    ].join('; ');

    res.setHeader('Set-Cookie', [
      `CloudFront-Policy=${cookies['CloudFront-Policy']}; ${cookieAttrs}`,
      `CloudFront-Signature=${cookies['CloudFront-Signature']}; ${cookieAttrs}`,
      `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}; ${cookieAttrs}`,
    ]);

    return { message: 'Cookies set' };
  }
}
