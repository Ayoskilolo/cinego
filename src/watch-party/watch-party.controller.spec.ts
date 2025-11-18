import { Test, TestingModule } from '@nestjs/testing';
import { WatchPartyController } from './watch-party.controller';

describe('WatchPartyController', () => {
  let controller: WatchPartyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchPartyController],
    }).compile();

    controller = module.get<WatchPartyController>(WatchPartyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
