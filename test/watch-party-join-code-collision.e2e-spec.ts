import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { ProvidersEntity } from '../src/providers/entities/providers.entity';
import { Movie } from '../src/movie/entities/movie.entity';
import { User } from '../src/user/entities/user.entity';
import { SubscriptionType } from '../src/user/enum/userType';
import { WatchPartyService } from '../src/watch-party/watch-party.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WatchParty } from '../src/watch-party/entities/watch-party.entity';

jest.setTimeout(20000);

async function createProviderAndMovie(ds: DataSource): Promise<Movie> {
  const providersRepo: Repository<ProvidersEntity> =
    ds.getRepository(ProvidersEntity);
  const moviesRepo: Repository<Movie> = ds.getRepository(Movie);
  const provider = providersRepo.create({
    name: 'Test Provider',
    slug: `prov-${Date.now()}`,
    baseUrl: 'https://example.com',
    isActive: true,
  });
  const savedProvider = await providersRepo.save(provider);
  const movie = moviesRepo.create({
    title: 'Collision Test Movie',
    providerId: savedProvider.id,
    providerTitleId: `pt-${Date.now()}`,
    programType: 'movie',
    synopsis: 'Test',
    productionYear: '2026',
    marketRating: 'PG',
    isHD: true,
    director: 'Dir',
    cast: ['A'],
    genres: ['Test'],
    languages: ['en'],
    duration: '90',
    isPremium: false,
    images: {
      poster: 'poster',
      posterLandscape: 'landscape',
      thumbnail: 'thumb',
    },
    mediaKeys: {
      main: 's3/main',
      trailer: 's3/trailer',
    },
  });
  return await moviesRepo.save(movie);
}

async function signUpUser(httpServer: any, email: string, password: string) {
  const res = await request(httpServer)
    .post('/auth/signup')
    .send({
      firstName: 'Test',
      lastName: 'User',
      email,
      password,
      dateOfBirth: '1990-01-01',
      preferredGenres: ['Action'],
    });
  expect([200, 201]).toContain(res.status);
  const token = res.body?.data?.accessToken;
  const user = res.body?.data?.user;
  expect(token).toBeDefined();
  expect(user?.id).toBeDefined();
  return { token, userId: user.id };
}

describe('WatchParty join code collision (e2e)', () => {
  let app: INestApplication;
  let httpServer: any;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    httpServer = app.getHttpServer();
    try {
      const scheduler = app.get(SchedulerRegistry);
      const cronJobs = scheduler.getCronJobs();
      cronJobs.forEach((job) => {
        try {
          job.stop();
        } catch {}
      });
    } catch {}
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('retries save on joinCode unique collision', async () => {
    const movie = await createProviderAndMovie(ds);
    const u1 = await signUpUser(
      httpServer,
      `u1-${Date.now()}@example.com`,
      'password123',
    );
    const u2 = await signUpUser(
      httpServer,
      `u2-${Date.now()}@example.com`,
      'password123',
    );

    const userRepo = ds.getRepository(User);
    await userRepo.update(
      { id: u1.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await userRepo.update(
      { id: u2.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );

    const partyRepo = ds.getRepository(WatchParty);
    const now = Date.now();
    const dup1 = `TCODE${now}A`;
    const dup2 = `TCODE${now}B`;
    const final1 = `TCODE${now}C`;
    const final2 = `TCODE${now}D`;
    const exist1 = await partyRepo.findOne({ where: { joinCode: dup1 } });
    if (!exist1) {
      await partyRepo.save(
        partyRepo.create({
          channelName: `seed1-${now}-${Math.floor(Math.random() * 1e9)}`,
          movieId: movie.id,
          status: 'ACTIVE',
          joinCode: dup1,
        }),
      );
    }
    const exist2 = await partyRepo.findOne({ where: { joinCode: dup2 } });
    if (!exist2) {
      await partyRepo.save(
        partyRepo.create({
          channelName: `seed2-${now}-${Math.floor(Math.random() * 1e9)}`,
          movieId: movie.id,
          status: 'ACTIVE',
          joinCode: dup2,
        }),
      );
    }

    const svc = app.get(WatchPartyService);
    const svcAny: any = svc as any;
    const spy: any = jest.spyOn(svcAny, 'generateUniqueJoinCode' as any);
    spy.mockResolvedValueOnce(dup1);
    spy.mockResolvedValueOnce(dup2);
    spy.mockResolvedValueOnce(final1);
    spy.mockResolvedValue(final2);

    const r1 = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${u1.token}`)
      .send({ movieId: movie.id, channelName: 'c1' });
    expect([200, 201]).toContain(r1.status);
    const join1 = r1.body?.data?.party?.joinCode;
    expect(join1).toBe(final1);

    const r2 = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${u2.token}`)
      .send({ movieId: movie.id, channelName: 'c2' });
    expect([200, 201]).toContain(r2.status);
    const join2 = r2.body?.data?.party?.joinCode;
    expect(join2).toBe(final2);
    expect(join2).not.toBe(join1);

    spy.mockRestore();
  });
});
