import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { ProvidersEntity } from '../src/providers/entities/providers.entity';
import { Movie } from '../src/movie/entities/movie.entity';

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

describe('Admin Authentication (e2e)', () => {
  let app: INestApplication;
  let httpServer: any;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Stop cron jobs to prevent side effects during tests
    const scheduler = app.get(SchedulerRegistry);
    try {
      const cronJobs = scheduler.getCronJobs();
      cronJobs.forEach((job) => job.stop());
    } catch (e) {
      // ignore if none
    }

    httpServer = app.getHttpServer();
    ds = app.get(DataSource);
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

    // 2) Ensure provider and seed a movie to obtain movieId
    const provider = await ensureProvider(ds);
    const movie = await seedMovie(ds, provider);

    // 3) Use token to call an ADMIN-only endpoint to create movie news under /admin/movie-news
    const createRes = await request(httpServer)
      .post('/admin/movie-news')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'E2E Admin Test',
        content: 'This is a test news item.',
        author: 'E2E Bot',
        description: 'Auth test',
        movieId: movie.id,
      });

    if (![200, 201].includes(createRes.status)) {
      // eslint-disable-next-line no-console
      console.log('Create admin movie-news failed:', createRes.status, createRes.body);
    }

    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body).toBeDefined();
  });
});