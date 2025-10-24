import { Module } from '@nestjs/common';
import { AwsServicesService } from './aws-services.service';
import { AwsSdkModule } from 'aws-sdk-v3-nest';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { AwsServicesController } from './aws-services.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movie/entities/movie.entity';
import { User } from '../user/entities/user.entity';
import { CloudfrontAccessGuard } from './guards/cloudfront-access.guard';
@Module({
  imports: [
    TypeOrmModule.forFeature([Movie, User]),
    AwsSdkModule.registerAsync({
      imports: [ConfigModule],
      clientType: S3Client,
      isGlobal: true,
      useFactory: (configService: ConfigService) =>
        new S3Client({
          region: configService.get('aws.region'),
          credentials: fromTemporaryCredentials({
            params: {
              RoleArn: configService.get('aws.roleArn'),
              RoleSessionName: 'cinego-api-aws',
            },
          }),
        }),
      inject: [ConfigService],
    }),
  ],
  providers: [AwsServicesService, CloudfrontAccessGuard],
  exports: [AwsServicesService],
  controllers: [AwsServicesController],
})
export class AwsServicesModule {}
