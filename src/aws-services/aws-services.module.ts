import { Module } from '@nestjs/common';
import { AwsServicesService } from './aws-services.service';

@Module({
  providers: [AwsServicesService]
})
export class AwsServicesModule {}
