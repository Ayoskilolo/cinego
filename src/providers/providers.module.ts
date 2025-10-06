import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { HttpModule } from '@nestjs/axios';
import { ProvidersEntity } from './entities/providers.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AdminProvidersController } from './admin-providers.controller';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([ProvidersEntity]), ConfigModule],
  controllers: [AdminProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
