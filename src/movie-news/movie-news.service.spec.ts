import { Test, TestingModule } from '@nestjs/testing';
import { MovieNewsService } from './movie-news.service';

describe('MovieNewsService', () => {
  let service: MovieNewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovieNewsService],
    }).compile();

    service = module.get<MovieNewsService>(MovieNewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
