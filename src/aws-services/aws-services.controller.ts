import { Controller, Get } from '@nestjs/common';
import { AwsServicesService } from './aws-services.service';
import { Public } from 'src/auth/auth.decorator';

@Controller('aws-services')
export class AwsServicesController {
  constructor(private readonly awsServicesService: AwsServicesService) {}

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
}
