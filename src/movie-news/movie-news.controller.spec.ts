import { Test, TestingModule } from '@nestjs/testing';
import { MovieNewsController } from './movie-news.controller';

describe('MovieNewsController', () => {
  let controller: MovieNewsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovieNewsController],
    }).compile();

    controller = module.get<MovieNewsController>(MovieNewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
