import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovieService } from './movie.service';
import { MovieController } from './movie.controller';
import { Movie } from './entities/movie.entity';
import { ProvidersModule } from '../providers/providers.module';
import { MyListModule } from '../my-list/my-list.module';
import { UserModule } from 'src/user/user.module';
import { AwsServicesModule } from '../aws-services/aws-services.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movie]),
    ProvidersModule,
    MyListModule,
    UserModule,
    AwsServicesModule,
  ],
  controllers: [MovieController],
  providers: [MovieService],
  exports: [MovieService],
})
export class MovieModule {}
