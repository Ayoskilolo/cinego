import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { SchedulerRegistry } from '@nestjs/schedule';

async function adminLogin(httpServer: any): Promise<string> {
  const res = await request(httpServer)
    .post('/auth/admin/login')
    .send({ email: 'admin@cinego.com', password: 'admin123' });
  if (![200, 201].includes(res.status)) {
    // eslint-disable-next-line no-console
    console.log('Admin login failed:', res.status, res.body);
  }
  const token = res.body?.data?.accessToken;
  expect(token).toBeDefined();
  return token;
}

async function createAndLoginNonAdmin(httpServer: any): Promise<string> {
  const uniqueEmail = `e2e.user.${Date.now()}@example.com`;

  const signupRes = await request(httpServer).post('/auth/signup').send({
    firstName: 'User',
    lastName: 'Test',
    email: uniqueEmail,
    password: 'StrongPass123',
    dateOfBirth: '1995-05-05',
  });
  if (![200, 201].includes(signupRes.status)) {
    // eslint-disable-next-line no-console
    console.log('Signup failed:', signupRes.status, signupRes.body);
  }
  expect([200, 201]).toContain(signupRes.status);

  const loginRes = await request(httpServer)
    .post('/auth/login')
    .send({ email: uniqueEmail, password: 'StrongPass123' });
  if (![200, 201].includes(loginRes.status)) {
    // eslint-disable-next-line no-console
    console.log('User login failed:', loginRes.status, loginRes.body);
  }
  expect([200, 201]).toContain(loginRes.status);

  const tempToken = loginRes.body?.data?.tempAccessToken;
  const profiles = loginRes.body?.data?.user?.profiles;
  expect(tempToken).toBeDefined();
  expect(profiles?.length).toBeGreaterThan(0);
  const profileId = profiles[0]?.id;
  expect(profileId).toBeDefined();

  const profileLoginRes = await request(httpServer)
    .post('/auth/login/profile')
    .set('Authorization', `Bearer ${tempToken}`)
    .send({ profileId });
  if (![200, 201].includes(profileLoginRes.status)) {
    // eslint-disable-next-line no-console
    console.log(
      'Login with profile failed:',
      profileLoginRes.status,
      profileLoginRes.body,
    );
  }
  expect([200, 201]).toContain(profileLoginRes.status);

  const accessToken = profileLoginRes.body?.data?.accessToken;
  expect(accessToken).toBeDefined();
  return accessToken;
}

// Helper: seed a transaction for a user (non-admin) via public initiate endpoint
async function seedTransaction(
  httpServer: any,
  userToken: string,
  payload: { amount: number; paymentReason: 'premium' | 'freemium' | 'cancellation' },
): Promise<{ reference: string; transactionId: string }> {
  const res = await request(httpServer)
    .post('/transactions/initiate')
    .set('Authorization', `Bearer ${userToken}`)
    .send(payload)
    .expect([200, 201] as any);

  const data = res.body?.data;
  expect(data?.reference).toBeDefined();
  expect(data?.transactionId).toBeDefined();
  return data;
}


describe('Admin Transactions (e2e)', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    // Stop scheduled cron jobs to avoid interference in tests
    const scheduler = app.get(SchedulerRegistry);
    try {
      const cronJobs = scheduler.getCronJobs();
      cronJobs.forEach((job) => job.stop());
    } catch (e) {
      // ignore if none
    }

    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth and RBAC', () => {
    it('GET /admin/transactions requires authentication (401)', async () => {
      await request(httpServer)
        .get('/admin/transactions')
        .expect(401);
    });

    it('GET /admin/transactions forbidden for non-admin (403)', async () => {
      const token = await createAndLoginNonAdmin(httpServer);
      await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('List endpoint', () => {
    it('returns items, meta, links shape', async () => {
      const token = await adminLogin(httpServer);
      const res = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('meta');
      expect(res.body.data).toHaveProperty('links');
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('supports pagination params without error', async () => {
      const token = await adminLogin(httpServer);
      await request(httpServer)
        .get('/admin/transactions?page=1&limit=10&sortBy=dateCreated:DESC')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('applies sort by amount ASC and DESC', async () => {
      // Seed some transactions to ensure varying amounts exist
      const userToken = await createAndLoginNonAdmin(httpServer);
      await seedTransaction(httpServer, userToken, { amount: 4200, paymentReason: 'premium' });
      await seedTransaction(httpServer, userToken, { amount: 3400, paymentReason: 'freemium' });
      await seedTransaction(httpServer, userToken, { amount: 6000, paymentReason: 'premium' });

      const adminToken = await adminLogin(httpServer);

      const asc = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ sortBy: 'amount:ASC', limit: 10 })
        .expect(200);

      const desc = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ sortBy: 'amount:DESC', limit: 10 })
        .expect(200);

      const ascFirst = asc.body?.data?.items?.[0];
      const descFirst = desc.body?.data?.items?.[0];
      expect(ascFirst).toBeDefined();
      expect(descFirst).toBeDefined();

      const a1 = Number(ascFirst?.amount);
      const d1 = Number(descFirst?.amount);
      expect(a1).toBeLessThanOrEqual(d1);

      // Additionally, ensure ASC list is non-decreasing for first few items
      const ascItems = asc.body?.data?.items ?? [];
      for (let i = 1; i < ascItems.length; i++) {
        if (ascItems[i - 1]?.amount != null && ascItems[i]?.amount != null) {
          expect(Number(ascItems[i - 1].amount)).toBeLessThanOrEqual(Number(ascItems[i].amount));
        }
      }
    });

    it('filters by paymentReason equality', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      // Seed mixed reasons
      await seedTransaction(httpServer, userToken, { amount: 4500, paymentReason: 'premium' });
      await seedTransaction(httpServer, userToken, { amount: 1600, paymentReason: 'freemium' });

      const adminToken = await adminLogin(httpServer);

      const byPremium = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.paymentReason': '$eq:premium', limit: 10 })
        .expect(200);

      const items = byPremium.body?.data?.items ?? [];
      for (const it of items) {
        expect(String(it.paymentReason)).toBe('premium');
      }
    });

    it('filters by amount range ($gte and $lte)', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      await seedTransaction(httpServer, userToken, { amount: 1500, paymentReason: 'freemium' });
      await seedTransaction(httpServer, userToken, { amount: 5000, paymentReason: 'freemium' });
      await seedTransaction(httpServer, userToken, { amount: 9000, paymentReason: 'premium' });

      const adminToken = await adminLogin(httpServer);

      const gte = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.amount': '$gte:5000', limit: 20 })
        .expect(200);

      const gteItems = gte.body?.data?.items ?? [];
      for (const it of gteItems) {
        expect(Number(it.amount)).toBeGreaterThanOrEqual(5000);
      }

      const lte = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.amount': '$lte:2000', limit: 20 })
        .expect(200);

      const lteItems = lte.body?.data?.items ?? [];
      for (const it of lteItems) {
        expect(Number(it.amount)).toBeLessThanOrEqual(2000);
      }
    });

    it('filters by dateCreated using $gte threshold (recent only)', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      // pick a threshold before seeding new transactions with a wide margin to avoid any clock skew or DB precision issues
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      await seedTransaction(httpServer, userToken, { amount: 4500, paymentReason: 'premium' });
      await seedTransaction(httpServer, userToken, { amount: 2200, paymentReason: 'freemium' });

      const adminToken = await adminLogin(httpServer);

      const recent = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.dateCreated': `$gte:${threshold.toISOString()}`, limit: 20 })
        .expect(200);

      const items = recent.body?.data?.items ?? [];
      for (const it of items) {
        const created = new Date(it.dateCreated).getTime();
        expect(created).toBeGreaterThanOrEqual(threshold.getTime());
      }
    });

    it('filters by paymentChanel equality (defaults to FLUTTERWAVE)', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      await seedTransaction(httpServer, userToken, { amount: 4500, paymentReason: 'premium' });

      const adminToken = await adminLogin(httpServer);
      const byChannel = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.paymentChanel': '$eq:flutterwave', limit: 10 })
        .expect(200);

      const items = byChannel.body?.data?.items ?? [];
      for (const it of items) {
        expect(String(it.paymentChanel)).toBe('flutterwave');
      }
    });
    it('sorts by dateCreated ASC and DESC under paymentReason=cancellation', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      // Seed three cancellation transactions with small delays to ensure distinct timestamps
      await seedTransaction(httpServer, userToken, { amount: 1000, paymentReason: 'cancellation' });
      await new Promise((r) => setTimeout(r, 700));
      await seedTransaction(httpServer, userToken, { amount: 2000, paymentReason: 'cancellation' });
      await new Promise((r) => setTimeout(r, 700));
      await seedTransaction(httpServer, userToken, { amount: 3000, paymentReason: 'cancellation' });

      const adminToken = await adminLogin(httpServer);

      const ascRes = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.paymentReason': '$eq:cancellation', sortBy: 'dateCreated:ASC', limit: 10 })
        .expect(200);
      const ascItems = ascRes.body?.data?.items ?? [];
      for (let i = 1; i < ascItems.length; i++) {
        const prev = new Date(ascItems[i - 1].dateCreated).getTime();
        const curr = new Date(ascItems[i].dateCreated).getTime();
        expect(prev).toBeLessThanOrEqual(curr);
      }

      const descRes = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.paymentReason': '$eq:cancellation', sortBy: 'dateCreated:DESC', limit: 10 })
        .expect(200);
      const descItems = descRes.body?.data?.items ?? [];
      for (let i = 1; i < descItems.length; i++) {
        const prev = new Date(descItems[i - 1].dateCreated).getTime();
        const curr = new Date(descItems[i].dateCreated).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
    it('filters by dateCreated using $lte threshold (older-or-equal)', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      await seedTransaction(httpServer, userToken, { amount: 5100, paymentReason: 'premium' });
      await seedTransaction(httpServer, userToken, { amount: 1200, paymentReason: 'freemium' });

      const adminToken = await adminLogin(httpServer);
      // Use a near-future threshold so that newly created items are definitely <= threshold
      const threshold = new Date(Date.now() + 60 * 1000); // 1 minute ahead

      const olderOrEqual = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.dateCreated': `$lte:${threshold.toISOString()}`, limit: 20 })
        .expect(200);

      const items = olderOrEqual.body?.data?.items ?? [];
      for (const it of items) {
        const created = new Date(it.dateCreated).getTime();
        expect(created).toBeLessThanOrEqual(threshold.getTime());
      }
    });
    it('filters by paymentChanel equality (defaults to FLUTTERWAVE)', async () => {
      const userToken = await createAndLoginNonAdmin(httpServer);
      await seedTransaction(httpServer, userToken, { amount: 4500, paymentReason: 'premium' });

      const adminToken = await adminLogin(httpServer);
      const byChannel = await request(httpServer)
        .get('/admin/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ 'filter.paymentChanel': '$eq:flutterwave', limit: 10 })
        .expect(200);

      const items = byChannel.body?.data?.items ?? [];
      for (const it of items) {
        expect(String(it.paymentChanel)).toBe('flutterwave');
      }
    });
  });

  describe('Get by id', () => {
    it('returns 400 for invalid uuid', async () => {
      const token = await adminLogin(httpServer);
      await request(httpServer)
        .get('/admin/transactions/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns 404 for missing id', async () => {
      const token = await adminLogin(httpServer);
      await request(httpServer)
        .get('/admin/transactions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});