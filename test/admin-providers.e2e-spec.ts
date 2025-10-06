import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
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

async function createProviderViaAdmin(httpServer: any, token: string, overrides: Partial<{name: string; slug: string; baseUrl: string; isActive: boolean}> = {}) {
  const unique = Date.now();
  const payload = {
    name: `E2E Provider ${unique}`,
    slug: `e2e-provider-${unique}`,
    baseUrl: `https://provider-${unique}.example.com`,
    isActive: true,
    ...overrides,
  };
  const res = await request(httpServer)
    .post('/admin/providers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  if (![200, 201].includes(res.status)) {
    // eslint-disable-next-line no-console
    console.log('Create provider failed:', res.status, res.body);
  }
  expect([200, 201]).toContain(res.status);
  const id = res.body?.data?.id;
  expect(id).toBeDefined();
  return { id, payload };
}

describe('Admin Providers (e2e)', () => {
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
    try {
      const scheduler = app.get(SchedulerRegistry);
      const jobs = scheduler.getCronJobs?.();
      if (jobs && typeof jobs.forEach === 'function') {
        jobs.forEach((job) => {
          try { job.stop(); } catch {}
        });
      }
    } catch {}

    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should require auth for listing providers', async () => {
    await request(httpServer).get('/admin/providers').expect(401);
  });

  it('should forbid non-admin user', async () => {
    const userToken = await createAndLoginNonAdmin(httpServer);

    await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('should allow admin to list providers (paginated) with correct envelope', async () => {
    const token = await adminLogin(httpServer);

    // Ensure at least one provider exists
    await createProviderViaAdmin(httpServer, token);

    const res = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body?.data).toBeDefined();
    expect(res.body?.data?.items).toBeDefined();
    expect(res.body?.data?.meta).toBeDefined();
    expect(res.body?.data?.links).toBeDefined();
  });

  it('should honor limit and page meta on list', async () => {
    const token = await adminLogin(httpServer);
    await createProviderViaAdmin(httpServer, token);
    await createProviderViaAdmin(httpServer, token);

    const res1 = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1, page: 1 })
      .expect(200);

    expect(Array.isArray(res1.body?.data?.items)).toBe(true);
    expect(res1.body?.data?.items.length).toBeLessThanOrEqual(1);
    const meta1 = res1.body?.data?.meta;
    expect(meta1?.itemsPerPage ?? meta1?.limit).toBe(1);
    expect(meta1?.currentPage ?? meta1?.page).toBe(1);

    const res2 = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1, page: 2 })
      .expect(200);

    const meta2 = res2.body?.data?.meta;
    expect(meta2?.currentPage ?? meta2?.page).toBe(2);
  });

  it('should support sortBy for dateCreated ASC vs DESC', async () => {
    const token = await adminLogin(httpServer);

    const asc = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ sortBy: 'dateCreated:ASC', limit: 1 })
      .expect(200);

    const desc = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ sortBy: 'dateCreated:DESC', limit: 1 })
      .expect(200);

    const ascFirst = asc.body?.data?.items?.[0];
    const descFirst = desc.body?.data?.items?.[0];

    expect(ascFirst).toBeDefined();
    expect(descFirst).toBeDefined();

    const ascDate = new Date(ascFirst?.dateCreated).getTime();
    const descDate = new Date(descFirst?.dateCreated).getTime();

    expect(ascDate).toBeLessThanOrEqual(descDate);
  });

  it('should support filter by isActive and by slug', async () => {
    const token = await adminLogin(httpServer);

    // create one inactive and one with distinctive slug
    const { payload } = await createProviderViaAdmin(httpServer, token, { isActive: false });
    const distinctive = await createProviderViaAdmin(httpServer, token, { slug: `unique-slug-${Date.now()}` });

    const activeRes = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ 'filter.isActive': '$eq:true' })
      .expect(200);

    const activeItems = activeRes.body?.data?.items ?? [];
    for (const it of activeItems) {
      expect(it.isActive).toBe(true);
    }

    const bySlug = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ 'filter.slug': `$eq:${distinctive.payload.slug}` })
      .expect(200);

    const slugItems = bySlug.body?.data?.items ?? [];
    expect(slugItems.length).toBeGreaterThan(0);
    for (const it of slugItems) {
      expect(it.slug).toBe(distinctive.payload.slug);
    }
  });

  it('should support search across name/slug', async () => {
    const token = await adminLogin(httpServer);
    const uniqueSlug = `searchable-slug-${Date.now()}`;
    await createProviderViaAdmin(httpServer, token, { slug: uniqueSlug });

    const searchRes = await request(httpServer)
      .get('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: uniqueSlug })
      .expect(200);

    const items = searchRes.body?.data?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(String(it.slug)).toContain('searchable-slug-');
    }
  });

  it('should require auth for create/get/update/delete', async () => {
    const someId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .post('/admin/providers')
      .send({ name: 'NoAuth', slug: `noauth-${Date.now()}`, baseUrl: 'https://x', isActive: true })
      .expect(401);

    await request(httpServer).get(`/admin/providers/${someId}`).expect(401);

    await request(httpServer)
      .patch(`/admin/providers/${someId}`)
      .send({ name: 'Hacker' })
      .expect(401);

    await request(httpServer).delete(`/admin/providers/${someId}`).expect(401);
  });

  it('should forbid non-admin for create/get/update/delete', async () => {
    const userToken = await createAndLoginNonAdmin(httpServer);
    const someId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .post('/admin/providers')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'NA', slug: `nonadmin-${Date.now()}`, baseUrl: 'https://x', isActive: true })
      .expect(403);

    await request(httpServer)
      .get(`/admin/providers/${someId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    await request(httpServer)
      .patch(`/admin/providers/${someId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Nope' })
      .expect(403);

    await request(httpServer)
      .delete(`/admin/providers/${someId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('should return 400 for invalid UUID params on get/update/delete', async () => {
    const token = await adminLogin(httpServer);
    const badId = 'not-a-uuid';

    await request(httpServer)
      .get(`/admin/providers/${badId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(httpServer)
      .patch(`/admin/providers/${badId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad' })
      .expect(400);

    await request(httpServer)
      .delete(`/admin/providers/${badId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('should return 404 for non-existent provider id on get/update and 204 on delete', async () => {
    const token = await adminLogin(httpServer);
    const missingId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .get(`/admin/providers/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(httpServer)
      .patch(`/admin/providers/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nobody' })
      .expect(404);

    // current implementation returns 204 even if nothing was deleted
    await request(httpServer)
      .delete(`/admin/providers/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('should allow admin to create, get, update, and delete a provider', async () => {
    const token = await adminLogin(httpServer);

    // Create
    const createRes = await request(httpServer)
      .post('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'E2E Provider Flow',
        slug: `e2e-provider-flow-${Date.now()}`,
        baseUrl: 'https://flow.example.com',
        isActive: true,
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const createdId = createRes.body?.data?.id;
    expect(createdId).toBeDefined();

    // Get by id
    const getRes = await request(httpServer)
      .get(`/admin/providers/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body?.data?.id).toBe(createdId);

    // Update
    const updateRes = await request(httpServer)
      .patch(`/admin/providers/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Provider Name', isActive: false })
      .expect(200);
    expect(updateRes.body?.data?.name).toBe('Updated Provider Name');
    expect(updateRes.body?.data?.isActive).toBe(false);

    // Delete
    await request(httpServer)
      .delete(`/admin/providers/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Verify gone
    await request(httpServer)
      .get(`/admin/providers/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('should return 400 for invalid create payload (missing required fields, invalid url, bad slug)', async () => {
    const token = await adminLogin(httpServer);

    // missing everything
    await request(httpServer)
      .post('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    // invalid url and slug
    await request(httpServer)
      .post('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', slug: 'Invalid Slug', baseUrl: 'notaurl', isActive: 'yes' })
      .expect(400);
  });

  it('should return 400 for invalid update payload (invalid url, empty name, bad slug)', async () => {
    const token = await adminLogin(httpServer);
    const created = await createProviderViaAdmin(httpServer, token);

    await request(httpServer)
      .patch(`/admin/providers/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', baseUrl: 'notaurl', slug: 'UPPER CASE' })
      .expect(400);
  });

  it('should return 409 Conflict when creating duplicate slug, and same on update', async () => {
    const token = await adminLogin(httpServer);

    const first = await createProviderViaAdmin(httpServer, token, { slug: `dup-${Date.now()}` });

    // Create second with same slug
    await request(httpServer)
      .post('/admin/providers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup 2', slug: first.payload.slug, baseUrl: 'https://dup2.example.com', isActive: true })
      .expect(409)
      .expect((res) => {
        // our HttpExceptionFilter envelopes as { status, message, data }
        expect(res.body?.status).toBe(false);
        expect(String(res.body?.message || '')).toContain('already');
      });

    // Update to existing slug
    const other = await createProviderViaAdmin(httpServer, token, { slug: `other-${Date.now()}` });
    await request(httpServer)
      .patch(`/admin/providers/${other.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: first.payload.slug })
      .expect(409);
  });
});