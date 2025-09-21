import { Test, TestingModule } from '@nestjs/testing';
import { AwsServicesController } from './aws-services.controller';

describe('AwsServicesController', () => {
  let controller: AwsServicesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AwsServicesController],
    }).compile();

    controller = module.get<AwsServicesController>(AwsServicesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
