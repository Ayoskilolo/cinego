import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let dataSource: { isInitialized: boolean; query: jest.Mock };

  beforeEach(async () => {
    dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    const mockRes = () => {
      const res: any = {};
      res.status = jest.fn().mockReturnValue(res);
      return res;
    };

    it('returns 200 and ok status when the database is reachable', async () => {
      const res = mockRes();
      const result = await appController.getHealth(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result.status).toBe(true);
      expect(result.data.status).toBe('ok');
      expect(result.data.checks.database.status).toBe('up');
    });

    it('returns 503 and error status when the database query fails', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('connection refused'));
      const res = mockRes();
      const result = await appController.getHealth(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.status).toBe(false);
      expect(result.data.status).toBe('error');
      expect(result.data.checks.database.status).toBe('down');
      expect(result.data.checks.database.error).toBe('connection refused');
    });
  });
});
