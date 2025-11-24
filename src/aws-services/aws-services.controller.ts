import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AwsServicesService } from './aws-services.service';
import { Public } from 'src/auth/auth.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { normalizeScope } from 'src/helpers';
import { CloudfrontAccessGuard } from './guards/cloudfront-access.guard';
import { Request } from 'express';

@ApiTags('aws-services')
@Controller('aws-services')
export class AwsServicesController {
  constructor(
    private readonly awsServicesService: AwsServicesService,
    private readonly configService: ConfigService,
  ) {}

  @Get('list-buckets')
  async listBuckets() {
    return this.awsServicesService.listBuckets();
  }

  @Get('show-movies-in-bucket')
  async showMoviesInBucket() {
    return this.awsServicesService.showMoviesInBucket();
  }

  @Get('get-presigned-url-for-movie')
  async getPresignedUrlForMovie() {
    return this.awsServicesService.getPresignedUrlForMovie();
  }

  @Post('cloudfront/signed-cookies')
  @UseGuards(CloudfrontAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate CloudFront signed cookies for a movie',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        movieId: { type: 'string', example: 'uuid-of-movie' },
        ttlSeconds: { type: 'number', example: 900 },
        useTrailer: { type: 'boolean', example: false },
        partyId: {
          type: 'string',
          example: 'uuid-of-active-party',
          nullable: true,
        },
      },
      required: ['movieId'],
      description:
        'Provide a movieId; cookies are scoped to the selected media folder (main by default, trailer when useTrailer=true). For premium movies, trailer access is allowed to all users; main access requires active PREMIUM. Optionally include partyId to allow freemium users to access premium main when in an active watch party hosted by a premium user. TTL in seconds (capped at 3600).',
    },
  })
  @ApiResponse({ status: 200, description: 'Cookies set successfully.' })
  async getCloudFrontSignedCookiesForMovie(
    @Body('movieId') movieId: string,
    @Body('ttlSeconds') ttlSeconds: number,
    @Body('useTrailer') useTrailer: boolean,
    @Res({ passthrough: true }) res: any,
    @Body() _body: any,
    @Req() req: Request,
  ) {
    const movie = (req as any)?.['movie'];
    const mediaKey: string | undefined = useTrailer
      ? movie?.mediaKeys?.trailer
      : movie?.mediaKeys?.main;
    if (!mediaKey) {
      throw new Error(
        useTrailer
          ? 'Trailer media key is missing.'
          : 'Movie media key is missing.',
      );
    }

    const scope = mediaKey;
    const { cookies, ttl, cookiePath, expires } =
      await this.awsServicesService.getCloudFrontSignedCookies(
        scope,
        ttlSeconds,
      );

    const domain = '.cinego.live'; // parent domain for cookie sharing across subdomains

    const cookieAttrs = [
      `Domain=${domain}`,
      `Path=${cookiePath}`,
      'Secure',
      'HttpOnly',
      'SameSite=None',
      `Max-Age=${ttl}`,
    ].join('; ');

    res.setHeader('Set-Cookie', [
      `CloudFront-Policy=${cookies['CloudFront-Policy']}; ${cookieAttrs}`,
      `CloudFront-Signature=${cookies['CloudFront-Signature']}; ${cookieAttrs}`,
      `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}; ${cookieAttrs}`,
    ]);

    const url = this.awsServicesService.buildMediaUrl(mediaKey);
    // TODO: remove the cookies from the response when api.cinego.live is available to stop the manual injection of cookies
    return {
      url,
      cookies,
      cookiePath,
      ttl,
      expires,
    };
  }
}
