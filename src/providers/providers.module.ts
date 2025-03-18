import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { HttpModule } from '@nestjs/axios';
import { ProvidersEntity } from './entities/providers.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([ProvidersEntity]),
    ConfigModule,
  ],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
