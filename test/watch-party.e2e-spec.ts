import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { ProvidersEntity } from '../src/providers/entities/providers.entity';
import { Movie } from '../src/movie/entities/movie.entity';
import { User } from '../src/user/entities/user.entity';
import { SubscriptionType } from '../src/user/enum/userType';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WatchParty } from '../src/watch-party/entities/watch-party.entity';

jest.setTimeout(30000);

async function createProviderAndMovie(ds: DataSource): Promise<Movie> {
  const providersRepo: Repository<ProvidersEntity> =
    ds.getRepository(ProvidersEntity);
  const moviesRepo: Repository<Movie> = ds.getRepository(Movie);
  const provider = providersRepo.create({
    name: `Prov-${Date.now()}`,
    slug: `prov-${Date.now()}`,
    baseUrl: 'https://example.com',
    isActive: true,
  });
  const savedProvider = await providersRepo.save(provider);
  const movie = moviesRepo.create({
    title: `WP-${Date.now()}`,
    providerId: savedProvider.id,
    providerTitleId: `pt-${Date.now()}`,
    programType: 'movie',
    synopsis: 's',
    productionYear: '2026',
    marketRating: 'PG',
    isHD: true,
    director: 'D',
    cast: ['A'],
    genres: ['Action'],
    languages: ['en'],
    duration: '90',
    isPremium: false,
    images: { poster: 'p', posterLandscape: 'pl', thumbnail: 't' },
    mediaKeys: { main: 's3/main', trailer: 's3/trailer' },
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
  return { token, userId: user.id, profileId: res.body?.data?.profile?.id };
}

describe('WatchParty (e2e)', () => {
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
    try {
      const scheduler = app.get(SchedulerRegistry);
      const cronJobs = scheduler.getCronJobs();
      cronJobs.forEach((job) => {
        try {
          job.stop();
        } catch {}
      });
    } catch {}
    httpServer = app.getHttpServer();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires auth for core endpoints', async () => {
    await request(httpServer).post('/watch-party/rtm/token').expect(401);
    await request(httpServer).post('/watch-party/rtc/token').expect(401);
    await request(httpServer).post('/watch-party/party/start').expect(401);
    await request(httpServer).post('/watch-party/party/join-by-code').expect(401);
  });

  it('starts a party and allows join-by-code, rotate code, and rejects old code', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host-${Date.now()}@example.com`,
      'password123',
    );
    const guest = await signUpUser(
      httpServer,
      `guest-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: guest.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );

    const startRes = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ movieId: movie.id, channelName: 'wp1' });
    expect([200, 201]).toContain(startRes.status);
    const party = startRes.body?.data?.party;
    expect(party?.id).toBeDefined();
    expect(party?.joinCode).toBeDefined();

    const joinRes = await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: party.joinCode });
    expect([200, 201]).toContain(joinRes.status);
    const joined = joinRes.body?.data?.party;
    const participantIds = (joined?.participants || []).map((u) => u.id);
    expect(participantIds).toEqual(
      expect.arrayContaining([host.userId, guest.userId]),
    );

    const rotateRes = await request(httpServer)
      .post('/watch-party/party/rotate-code')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId: party.id });
    expect([200, 201]).toContain(rotateRes.status);
    const oldCode = party.joinCode;
    const newCode = rotateRes.body?.data?.joinCode;
    expect(newCode).toBeDefined();
    expect(newCode).not.toBe(oldCode);

    await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: oldCode })
      .expect(404);

    const joinNewRes = await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: newCode });
    expect([200, 201]).toContain(joinNewRes.status);
  });

  it('schedules party, enforces invite-only until start, then allows invited join-by-code, with idempotent start', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host2-${Date.now()}@example.com`,
      'password123',
    );
    const invited = await signUpUser(
      httpServer,
      `inv-${Date.now()}@example.com`,
      'password123',
    );
    const outsider = await signUpUser(
      httpServer,
      `out-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: invited.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: outsider.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );

    const in5min = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const schedRes = await request(httpServer)
      .post('/watch-party/party/schedule')
      .set('Authorization', `Bearer ${host.token}`)
      .send({
        movieId: movie.id,
        channelName: 'sched1',
        scheduledFor: in5min,
        inviteeIds: [invited.userId],
      });
    expect([200, 201]).toContain(schedRes.status);
    const party = schedRes.body?.data;
    expect(party?.status).toBe('SCHEDULED');

    await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ code: party.joinCode })
      .expect(403);

    const key = `start-${Date.now()}`;
    const startSchedRes = await request(httpServer)
      .post('/watch-party/party/start-scheduled')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId: party.id, idempotencyKey: key });
    expect([200, 201]).toContain(startSchedRes.status);
    const started = startSchedRes.body?.data?.party;
    expect(started?.status).toBe('ACTIVE');

    const startSchedAgainRes = await request(httpServer)
      .post('/watch-party/party/start-scheduled')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId: party.id, idempotencyKey: key });
    expect([200, 201]).toContain(startSchedAgainRes.status);
    const again = startSchedAgainRes.body?.data?.party;
    expect(again?.id).toBe(party.id);
    expect(again?.status).toBe('ACTIVE');

    const invitedJoinRes = await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${invited.token}`)
      .send({ code: party.joinCode });
    expect([200, 201]).toContain(invitedJoinRes.status);
  });

  it('host can kick, ban, unban participant', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host3-${Date.now()}@example.com`,
      'password123',
    );
    const guest = await signUpUser(
      httpServer,
      `guest3-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: guest.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    const startRes = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ movieId: movie.id, channelName: 'wp3' });
    const partyId = startRes.body?.data?.party?.id;
    const joinRes = await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: startRes.body?.data?.party?.joinCode });
    expect([200, 201]).toContain(joinRes.status);

    const kickRes = await request(httpServer)
      .post('/watch-party/party/kick')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId, userId: guest.userId });
    expect([200, 201]).toContain(kickRes.status);
    const p1 = kickRes.body?.data;
    const ids1 = (p1?.participants || []).map((u) => u.id);
    expect(ids1).not.toContain(guest.userId);

    const rejoinRes = await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: startRes.body?.data?.party?.joinCode });
    expect([200, 201]).toContain(rejoinRes.status);

    const banRes = await request(httpServer)
      .post('/watch-party/party/ban')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId, userId: guest.userId });
    expect([200, 201]).toContain(banRes.status);

    await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: startRes.body?.data?.party?.joinCode })
      .expect(403);

    const unbanRes = await request(httpServer)
      .post('/watch-party/party/unban')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId, userId: guest.userId });
    expect([200, 201]).toContain(unbanRes.status);

    const joinAgainRes = await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: startRes.body?.data?.party?.joinCode });
    expect([200, 201]).toContain(joinAgainRes.status);
  });

  it('end party updates freemium participant subscription', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host4-${Date.now()}@example.com`,
      'password123',
    );
    const freeUser = await signUpUser(
      httpServer,
      `free-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: freeUser.userId },
      { subscriptionType: SubscriptionType.FREEMIUM },
    );
    const startRes = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ movieId: movie.id, channelName: 'wp4' });
    const partyId = startRes.body?.data?.party?.id;
    await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({ code: startRes.body?.data?.party?.joinCode })
      .expect([200, 201]);
    const endRes = await request(httpServer)
      .post('/watch-party/party/end')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId });
    expect([200, 201]).toContain(endRes.status);
    const updatedFree = await ds
      .getRepository(User)
      .findOne({ where: { id: freeUser.userId } });
    expect(updatedFree?.subscriptionType).toBe(SubscriptionType.FREE_TIER);
  });

  it('RTM/RTC token endpoints return tokens', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host5-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    const startRes = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ movieId: movie.id, channelName: 'wp5' });
    const party = startRes.body?.data?.party;
    const rtmRes = await request(httpServer)
      .post('/watch-party/rtm/token')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ expireSeconds: 600 });
    expect([200, 201]).toContain(rtmRes.status);
    expect(rtmRes.body?.data?.token).toBeDefined();
    const rtcRes = await request(httpServer)
      .post('/watch-party/rtc/token')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ channelName: party.channelName, expireSeconds: 600 });
    expect([200, 201]).toContain(rtcRes.status);
    expect(rtcRes.body?.data?.token).toBeDefined();
  });

  it('join-by-id forbids non-host and succeeds for host', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host6-${Date.now()}@example.com`,
      'password123',
    );
    const guest = await signUpUser(
      httpServer,
      `guest6-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: guest.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    const startRes = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ movieId: movie.id, channelName: 'wp6' });
    const partyId = startRes.body?.data?.party?.id;
    await request(httpServer)
      .post('/watch-party/party/join')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ partyId })
      .expect(403);
    const hostJoinRes = await request(httpServer)
      .post('/watch-party/party/join')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ partyId });
    expect([200, 201]).toContain(hostJoinRes.status);
  });

  it('host reassignment after hostLeftAt elapsed', async () => {
    const movie = await createProviderAndMovie(ds);
    const host = await signUpUser(
      httpServer,
      `host7-${Date.now()}@example.com`,
      'password123',
    );
    const guest = await signUpUser(
      httpServer,
      `guest7-${Date.now()}@example.com`,
      'password123',
    );
    await ds.getRepository(User).update(
      { id: host.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    await ds.getRepository(User).update(
      { id: guest.userId },
      { subscriptionType: SubscriptionType.PREMIUM },
    );
    const startRes = await request(httpServer)
      .post('/watch-party/party/start')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ movieId: movie.id, channelName: 'wp7' });
    const partyId = startRes.body?.data?.party?.id;
    await request(httpServer)
      .post('/watch-party/party/join-by-code')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ code: startRes.body?.data?.party?.joinCode })
      .expect([200, 201]);
    const partyRepo = ds.getRepository(WatchParty);
    let p = await partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
    p.hostLeftAt = new Date(Date.now() - 61_000);
    await partyRepo.save(p);
    const metaRes = await request(httpServer)
      .get(`/watch-party/party/${partyId}`)
      .set('Authorization', `Bearer ${host.token}`);
    expect([200, 201]).toContain(metaRes.status);
    const meta = metaRes.body?.data?.party;
    expect(meta?.hostId).toBe(guest.userId);
  });
});
