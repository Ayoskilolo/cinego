import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { DataSource, Repository, DeepPartial } from 'typeorm';
import { ProvidersEntity } from '../src/providers/entities/providers.entity';
import { Movie } from '../src/movie/entities/movie.entity';
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

async function ensureProvider(ds: DataSource): Promise<ProvidersEntity> {
  const repo = ds.getRepository(ProvidersEntity);
  let provider = await repo.findOne({ where: { slug: 'e2e-provider' } });
  if (!provider) {
    provider = repo.create({
      name: 'E2E Provider',
      slug: 'e2e-provider',
      baseUrl: 'https://e2e-provider.example.com',
      isActive: true,
    });
    provider = await repo.save(provider);
  }
  return provider;
}

function buildMovieData(
  provider: ProvidersEntity,
  overrides: DeepPartial<Movie> = {},
): DeepPartial<Movie> {
  const unique = Date.now().toString();
  return {
    title: `E2E Movie ${unique}`,
    providerId: provider.id,
    providerTitleId: `prov-title-${unique}`,
    programType: 'movie',
    synopsis: 'E2E synopsis',
    productionYear: '2020',
    marketRating: 'PG',
    isHD: true,
    director: 'E2E Director',
    cast: ['Actor A', 'Actor B'],
    genres: ['Action', 'Drama'],
    languages: ['English'],
    duration: '120 min',
    isPremium: false,
    images: {
      poster: 'https://example.com/poster.jpg',
      posterLandscape: 'https://example.com/poster-land.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
    },
    ...overrides,
  };
}

async function seedMovie(
  ds: DataSource,
  provider: ProvidersEntity,
  overrides: DeepPartial<Movie> = {},
): Promise<Movie> {
  const repo: Repository<Movie> = ds.getRepository(Movie);
  const data: DeepPartial<Movie> = buildMovieData(provider, overrides);
  const entity: Movie = repo.create(data as DeepPartial<Movie>) as Movie;
  return await repo.save(entity);
}

describe('Admin Movies (e2e)', () => {
  let app: INestApplication;
  let httpServer: any;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Stop any scheduled cron jobs to avoid open handle leaks during tests
    try {
      const scheduler = app.get(SchedulerRegistry);
      const jobs = scheduler.getCronJobs?.();
      if (jobs && typeof jobs.forEach === 'function') {
        jobs.forEach((job, name) => {
          try {
            job.stop();
          } catch (e) {
            // ignore
          }
        });
      }
    } catch (e) {
      // ignore if scheduler not available
    }

    httpServer = app.getHttpServer();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should require auth for listing movies', async () => {
    await request(httpServer).get('/admin/movies').expect(401);
  });

  it('should forbid non-admin user', async () => {
    const userToken = await createAndLoginNonAdmin(httpServer);

    await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('should allow admin to list movies (paginated) with correct envelope and sanitized fields', async () => {
    const token = await adminLogin(httpServer);

    const provider = await ensureProvider(ds);
    await seedMovie(ds, provider);

    const res = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body?.data).toBeDefined();
    expect(res.body?.data?.items).toBeDefined();
    expect(res.body?.data?.meta).toBeDefined();
    expect(res.body?.data?.links).toBeDefined();

    const first = res.body?.data?.items?.[0];
    if (first) {
      expect(first.id).toBeDefined();
      expect(first.title).toBeDefined();
      // providerId must be excluded from admin list select
      expect(first.providerId).toBeUndefined();
      // mediaKeys should never appear
      expect(first.mediaKeys).toBeUndefined();
    }
  });

  it('should honor limit and page meta on list', async () => {
    const token = await adminLogin(httpServer);

    const res1 = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1, page: 1 })
      .expect(200);

    expect(Array.isArray(res1.body?.data?.items)).toBe(true);
    expect(res1.body?.data?.items.length).toBeLessThanOrEqual(1);
    const meta1 = res1.body?.data?.meta;
    expect(meta1?.itemsPerPage ?? meta1?.limit).toBe(1);
    expect(meta1?.currentPage ?? meta1?.page).toBe(1);

    const res2 = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1, page: 2 })
      .expect(200);

    const meta2 = res2.body?.data?.meta;
    expect(meta2?.currentPage ?? meta2?.page).toBe(2);
  });

  it('should support sortBy for dateCreated ASC vs DESC', async () => {
    const token = await adminLogin(httpServer);

    const asc = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .query({ sortBy: 'dateCreated:ASC', limit: 1 })
      .expect(200);

    const desc = await request(httpServer)
      .get('/admin/movies')
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

  it('should support filter by isHD and isPremium', async () => {
    const token = await adminLogin(httpServer);
    const provider = await ensureProvider(ds);

    // Seed a premium movie
    await seedMovie(ds, provider, { isHD: true, isPremium: true });

    const byHD = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .query({ 'filter.isHD': '$eq:true' })
      .expect(200);

    const hdItems = byHD.body?.data?.items ?? [];
    for (const it of hdItems) {
      expect(it.isHD).toBe(true);
    }

    const byPremium = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .query({ 'filter.isPremium': '$eq:true' })
      .expect(200);

    const premiumItems = byPremium.body?.data?.items ?? [];
    for (const it of premiumItems) {
      expect(it.isPremium).toBe(true);
    }
  });

  it('should support text search on title', async () => {
    const token = await adminLogin(httpServer);
    const provider = await ensureProvider(ds);

    await seedMovie(ds, provider, { title: 'Unique Searchable Movie' });

    const res = await request(httpServer)
      .get('/admin/movies')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: 'Unique Searchable' })
      .expect(200);

    const items = res.body?.data?.items ?? [];
    const hasUnique = items.some((m) => m.title.includes('Unique Searchable'));
    expect(hasUnique).toBe(true);
  });

  it('should get, update and delete a movie by id', async () => {
    const token = await adminLogin(httpServer);
    const provider = await ensureProvider(ds);
    const movie = await seedMovie(ds, provider, { title: 'Before Update' });

    // get
    const got = await request(httpServer)
      .get(`/admin/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(got.body?.data?.id).toBe(movie.id);

    // update
    const updated = await request(httpServer)
      .patch(`/admin/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'After Update', isPremium: true })
      .expect(200);

    expect(updated.body?.data?.title).toBe('After Update');
    expect(updated.body?.data?.isPremium).toBe(true);

    // get again
    const got2 = await request(httpServer)
      .get(`/admin/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(got2.body?.data?.title).toBe('After Update');

    // delete
    await request(httpServer)
      .delete(`/admin/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // get should 404
    await request(httpServer)
      .get(`/admin/movies/${movie.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // Negative tests for setPremiumStatus (admin-only endpoint on /movie/:id/set-premium)
  it('should return 404 when movieId is missing in the route for setPremiumStatus', async () => {
    const token = await adminLogin(httpServer);
    await request(httpServer)
      .patch('/movie/set-premium') // missing :id segment, route should not match
      .set('Authorization', `Bearer ${token}`)
      .send({ isPremium: true })
      .expect(404);
  });

  it('should return 404 when movieId does not exist for setPremiumStatus', async () => {
    const token = await adminLogin(httpServer);
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await request(httpServer)
      .patch(`/movie/${nonExistentId}/set-premium`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPremium: true })
      .expect(404);
  });
});