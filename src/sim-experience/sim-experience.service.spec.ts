import { Test, TestingModule } from '@nestjs/testing';
import { SimExperienceService } from './sim-experience.service';

describe('SimExperienceService', () => {
  let service: SimExperienceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SimExperienceService],
    }).compile();

    service = module.get<SimExperienceService>(SimExperienceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
