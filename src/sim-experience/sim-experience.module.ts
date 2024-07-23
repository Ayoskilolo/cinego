import { Module } from '@nestjs/common';
import { SimExperienceService } from './sim-experience.service';
import { SimExperienceController } from './sim-experience.controller';

@Module({
  controllers: [SimExperienceController],
  providers: [SimExperienceService],
})
export class SimExperienceModule {}
