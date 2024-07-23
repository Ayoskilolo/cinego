import { Test, TestingModule } from '@nestjs/testing';
import { SimExperienceController } from './sim-experience.controller';
import { SimExperienceService } from './sim-experience.service';

describe('SimExperienceController', () => {
  let controller: SimExperienceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimExperienceController],
      providers: [SimExperienceService],
    }).compile();

    controller = module.get<SimExperienceController>(SimExperienceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
