import { Test, TestingModule } from '@nestjs/testing';
import { AwsServicesService } from './aws-services.service';

describe('AwsServicesService', () => {
  let service: AwsServicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AwsServicesService],
    }).compile();

    service = module.get<AwsServicesService>(AwsServicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
