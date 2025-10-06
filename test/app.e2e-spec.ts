import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { SchedulerRegistry } from '@nestjs/schedule';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Stop any scheduled cron jobs to avoid open handles
    try {
      const scheduler = app.get(SchedulerRegistry);
      const cronJobs = scheduler.getCronJobs();
      cronJobs.forEach((job) => {
        try { job.stop(); } catch {}
      });
    } catch {}
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET) should return 401 when unauthenticated', async () => {
    await request(app.getHttpServer()).get('/').expect(401);
  });
});
