import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Admin Authentication (e2e)', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should login as admin and create a movie news item', async () => {
    // 1) Admin login
    const loginAttempt = await request(httpServer)
      .post('/auth/admin/login')
      .send({ email: 'admin@cinego.com', password: 'admin123' });

    if (![200, 201].includes(loginAttempt.status)) {
      // Log error body to help diagnose 500s
      // eslint-disable-next-line no-console
      console.log('Admin login failed:', loginAttempt.status, loginAttempt.body);
    }

    expect([200, 201]).toContain(loginAttempt.status);

    const { data } = loginAttempt.body;
    expect(data).toBeDefined();
    expect(data.accessToken).toBeDefined();

    const token = data.accessToken;

    // 2) Use token to call an ADMIN-only endpoint
    const createRes = await request(httpServer)
      .post('/movie-news')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'E2E Admin Test', content: 'This is a test news item.' });

    if (![200, 201].includes(createRes.status)) {
      // eslint-disable-next-line no-console
      console.log('Create movie-news failed:', createRes.status, createRes.body);
    }

    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body).toBeDefined();
  });
});