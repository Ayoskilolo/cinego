import { Test, TestingModule } from '@nestjs/testing';
import { WatchPartyService } from './watch-party.service';

describe('WatchPartyService', () => {
  let service: WatchPartyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WatchPartyService],
    }).compile();

    service = module.get<WatchPartyService>(WatchPartyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
