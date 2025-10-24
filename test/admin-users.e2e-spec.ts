import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { SchedulerRegistry } from '@nestjs/schedule';
// Increase Jest timeout for slower e2e flows
jest.setTimeout(20000);

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

  // Sign up a user (public endpoint)
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

  // Login (pre-profile) to get tempAccessToken and user profiles
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

  // Login with profile to get full access token
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

describe('Admin Users (e2e)', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
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

  it('should require auth for listing users', async () => {
    await request(httpServer).get('/admin/users').expect(401);
  });

  it('should forbid non-admin user', async () => {
    const userToken = await createAndLoginNonAdmin(httpServer);

    await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('should allow admin to list users (paginated)', async () => {
    const token = await adminLogin(httpServer);

    const res = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body?.data).toBeDefined();
  });

  it('should require auth for create/get/update/delete', async () => {
    const someId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .post('/admin/users')
      .send({
        firstName: 'NoAuth',
        lastName: 'User',
        email: `noauth.${Date.now()}@example.com`,
        password: 'StrongPass123',
        dateOfBirth: '1990-01-01',
      })
      .expect(401);

    await request(httpServer).get(`/admin/users/${someId}`).expect(401);

    await request(httpServer)
      .patch(`/admin/users/${someId}`)
      .send({ firstName: 'Hacker' })
      .expect(401);

    await request(httpServer).delete(`/admin/users/${someId}`).expect(401);
  });

  it('should forbid non-admin for create/get/update/delete', async () => {
    const userToken = await createAndLoginNonAdmin(httpServer);
    const someId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .post('/admin/users')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        firstName: 'NA',
        lastName: 'Role',
        email: `nonadmin.${Date.now()}@example.com`,
        password: 'StrongPass123',
        dateOfBirth: '1990-01-01',
      })
      .expect(403);

    await request(httpServer)
      .get(`/admin/users/${someId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    await request(httpServer)
      .patch(`/admin/users/${someId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ firstName: 'Nope' })
      .expect(403);

    await request(httpServer)
      .delete(`/admin/users/${someId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('should include items, meta and links inside data for list', async () => {
    const token = await adminLogin(httpServer);

    const res = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body?.data?.items).toBeDefined();
    expect(res.body?.data?.meta).toBeDefined();
    expect(res.body?.data?.links).toBeDefined();
  });

  it('should honor limit and page meta on list', async () => {
    const token = await adminLogin(httpServer);

    const res1 = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1, page: 1 })
      .expect(200);

    expect(Array.isArray(res1.body?.data?.items)).toBe(true);
    expect(res1.body?.data?.items.length).toBeLessThanOrEqual(1);
    expect(res1.body?.data?.meta?.itemsPerPage ?? res1.body?.data?.meta?.limit).toBe(1);
    expect(res1.body?.data?.meta?.currentPage ?? res1.body?.data?.meta?.page).toBe(1);

    const res2 = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1, page: 2 })
      .expect(200);

    expect(res2.body?.data?.meta?.currentPage ?? res2.body?.data?.meta?.page).toBe(2);
  });

  it('should support sortBy for dateCreated ASC vs DESC', async () => {
    const token = await adminLogin(httpServer);

    const asc = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ sortBy: 'dateCreated:ASC', limit: 1 })
      .expect(200);

    const desc = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ sortBy: 'dateCreated:DESC', limit: 1 })
      .expect(200);

    const ascFirst = asc.body?.data?.items?.[0];
    const descFirst = desc.body?.data?.items?.[0];

    expect(ascFirst).toBeDefined();
    expect(descFirst).toBeDefined();

    const ascDate = new Date(ascFirst?.dateCreated).getTime();
    const descDate = new Date(descFirst?.dateCreated).getTime();

    // With ASC earliest first and DESC latest first, ascDate should be <= descDate
    expect(ascDate).toBeLessThanOrEqual(descDate);
  });

  it('should support filter by role', async () => {
    const token = await adminLogin(httpServer);

    // Filter by role admin (nestjs-paginate syntax uses dotted keys)
    const byRole = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ 'filter.role': '$eq:admin' })
      .expect(200);

    const roleItems = byRole.body?.data?.items ?? [];
    for (const it of roleItems) {
      expect(it.role).toBe('admin');
    }
  });

  it('should support search across firstName/lastName/email/phoneNumber', async () => {
    const token = await adminLogin(httpServer);

    // Create a distinct user to search for by email
    const uniqueEmail = `searchable.${Date.now()}@example.com`;
    await request(httpServer)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Searchable',
        lastName: 'Target',
        email: uniqueEmail,
        password: 'StrongPass123',
        dateOfBirth: '1990-01-01',
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const searchRes = await request(httpServer)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: uniqueEmail })
      .expect(200);

    const items = searchRes.body?.data?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(String(it.email)).toContain('searchable.');
    }
  });

  it('should return 400 for invalid UUID params on get/update/delete', async () => {
    const token = await adminLogin(httpServer);
    const badId = 'not-a-uuid';

    await request(httpServer)
      .get(`/admin/users/${badId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(httpServer)
      .patch(`/admin/users/${badId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Bad' })
      .expect(400);

    await request(httpServer)
      .delete(`/admin/users/${badId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('should return 404 for non-existent user id on get/update/delete', async () => {
    const token = await adminLogin(httpServer);
    const missingId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .get(`/admin/users/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(httpServer)
      .patch(`/admin/users/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Nobody' })
      .expect(404);

    await request(httpServer)
      .delete(`/admin/users/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('should return 400 for invalid create payload (validation error)', async () => {
    const token = await adminLogin(httpServer);
    await request(httpServer)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('should allow admin to create, get, update, and delete a user', async () => {
    const token = await adminLogin(httpServer);

    // Create
    const createRes = await request(httpServer)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'E2E',
        lastName: 'AdminUser',
        email: `e2e.admin.${Date.now()}@example.com`,
        password: 'StrongPass123',
        dateOfBirth: '1990-01-01',
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const createdId = createRes.body?.data?.id;
    expect(createdId).toBeDefined();

    // Get by id
    const getRes = await request(httpServer)
      .get(`/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body?.data?.id).toBe(createdId);

    // Update
    const updateRes = await request(httpServer)
      .patch(`/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'UpdatedName' })
      .expect(200);
    expect(updateRes.body?.data?.firstName).toBe('UpdatedName');

    // Delete
    await request(httpServer)
      .delete(`/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  // Helper: create a fresh user via admin and return its id
  async function createUserViaAdmin(token: string): Promise<string> {
    const uniqueEmail = `guardrail.${Date.now()}@example.com`;
    const createRes = await request(httpServer)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Guard',
        lastName: 'Rails',
        email: uniqueEmail,
        password: 'StrongPass123',
        dateOfBirth: '1990-01-01',
      })
      .expect((r) => expect([200, 201]).toContain(r.status));
    const id = createRes.body?.data?.id ?? createRes.body?.id;
    expect(id).toBeDefined();
    return id;
  }

  describe('Business guardrails', () => {
    it('enforces PREMIUM requires both dates when switching', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);

      const res = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM' })
        .expect(400);
      expect(String(res.body?.message || res.text)).toContain(
        'nextBillingDate and subscriptionExpiresAt are required',
      );
    });

    it('enforces dates must be future and expires >= nextBillingDate for PREMIUM', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);

      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // nextBillingDate in past -> error
      const res1 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', nextBillingDate: past, subscriptionExpiresAt: future })
        .expect(400);
      expect(String(res1.body?.message || res1.text)).toContain(
        'nextBillingDate must be in the future',
      );

      // subscriptionExpiresAt in past -> error
      const res2 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', nextBillingDate: future, subscriptionExpiresAt: past })
        .expect(400);
      expect(String(res2.body?.message || res2.text)).toContain(
        'subscriptionExpiresAt must be in the future',
      );

      // expires < nextBillingDate -> error
      const next2 = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const exp1 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res3 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', nextBillingDate: next2, subscriptionExpiresAt: exp1 })
        .expect(400);
      expect(String(res3.body?.message || res3.text)).toContain(
        'subscriptionExpiresAt must be greater than or equal to nextBillingDate',
      );
    });

    it('enforces invariants: isSubscribed true requires PREMIUM, false forbids PREMIUM', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);

      // isSubscribed true with FREEMIUM -> coerced to false and success
      const res1 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'FREEMIUM', isSubscribed: true })
        .expect(200);
      const user1 = res1.body?.data ?? res1.body;
      expect(user1?.subscriptionType).toBe('FREEMIUM');
      expect(user1?.isSubscribed).toBe(false);

      // isSubscribed false with PREMIUM -> coerced to true and success
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res2 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', isSubscribed: false, nextBillingDate: future, subscriptionExpiresAt: future })
        .expect(200);
      const user2 = res2.body?.data ?? res2.body;
      expect(user2?.subscriptionType).toBe('PREMIUM');
      expect(user2?.isSubscribed).toBe(true);
    });

    it('enforces FREE_TIER/FREEMIUM normalize to null dates', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // nextBillingDate non-null on FREE_TIER -> coerced to null and success
      const res1 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'FREE_TIER', nextBillingDate: future })
        .expect(200);
      const user1 = res1.body?.data ?? res1.body;
      expect(user1?.subscriptionType).toBe('FREE_TIER');
      expect(user1?.isSubscribed).toBe(false);
      expect(user1?.nextBillingDate).toBeNull();
      expect(user1?.subscriptionExpiresAt).toBeNull();

      // subscriptionExpiresAt non-null on FREEMIUM -> coerced to null and success
      const res2 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'FREEMIUM', subscriptionExpiresAt: future })
        .expect(200);
      const user2 = res2.body?.data ?? res2.body;
      expect(user2?.subscriptionType).toBe('FREEMIUM');
      expect(user2?.isSubscribed).toBe(false);
      expect(user2?.nextBillingDate).toBeNull();
      expect(user2?.subscriptionExpiresAt).toBeNull();
    });

    it('validates ISO 8601 formatting for date inputs', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);

      const bad = 'not-a-date';
      const res1 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', nextBillingDate: bad, subscriptionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .expect(400);
      expect(String(res1.body?.message || res1.text)).toMatch(/ISO 8601/i);

      const res2 = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', nextBillingDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), subscriptionExpiresAt: bad })
        .expect(400);
      expect(String(res2.body?.message || res2.text)).toMatch(/ISO 8601/i);
    });

    it('accepts a valid PREMIUM update and enforces FREEMIUM normalization', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);

      const next = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const exp = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const ok = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'PREMIUM', nextBillingDate: next, subscriptionExpiresAt: exp })
        .expect(200);
      const premiumUser = ok.body?.data ?? ok.body;
      expect(premiumUser?.subscriptionType).toBe('PREMIUM');
      expect(premiumUser?.isSubscribed).toBe(true);
      expect(new Date(premiumUser?.nextBillingDate).getTime()).toBeGreaterThan(Date.now());

      // Switch to FREEMIUM should null dates and set isSubscribed false
      const freemiumRes = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionType: 'FREEMIUM' })
        .expect(200);
      const freemiumUser = freemiumRes.body?.data ?? freemiumRes.body;
      expect(freemiumUser?.subscriptionType).toBe('FREEMIUM');
      expect(freemiumUser?.isSubscribed).toBe(false);
      expect(freemiumUser?.nextBillingDate).toBeNull();
      expect(freemiumUser?.subscriptionExpiresAt).toBeNull();
    });

    it('allows setting isEmailVerified=true when account has a valid email', async () => {
      const token = await adminLogin(httpServer);
      const id = await createUserViaAdmin(token);

      const res = await request(httpServer)
        .patch(`/admin/users/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isEmailVerified: true })
        .expect(200);

      const user = res.body?.data ?? res.body;
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.email).toBeDefined();
    });
  });
});
