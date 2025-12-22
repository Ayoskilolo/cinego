import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { DataSource, Repository, DeepPartial } from 'typeorm';
import { ProvidersEntity } from '../src/providers/entities/providers.entity';
import { Movie } from '../src/movie/entities/movie.entity';
import { MovieContentType } from '../src/movie/enums/movie-content-type.enum';
import { MyListEntity } from '../src/my-list/entities/my-list.entity';
import { SchedulerRegistry } from '@nestjs/schedule';

async function createAndLoginUserWithProfile(
  httpServer: any,
): Promise<{ accessToken: string; profileId: string }> {
  const uniqueEmail = `e2e.series.user.${Date.now()}@example.com`;

  const signupRes = await request(httpServer).post('/auth/signup').send({
    firstName: 'Series',
    lastName: 'Tester',
    email: uniqueEmail,
    password: 'StrongPass123',
    dateOfBirth: '1995-05-05',
  });
  expect([200, 201]).toContain(signupRes.status);

  const loginRes = await request(httpServer)
    .post('/auth/login')
    .send({ email: uniqueEmail, password: 'StrongPass123' });
  expect([200, 201]).toContain(loginRes.status);

  const tempToken = loginRes.body?.data?.tempAccessToken;
  const profiles = loginRes.body?.data?.user?.profiles;
  expect(tempToken).toBeDefined();
  expect(profiles?.length).toBeGreaterThan(0);
  const profileId = profiles[0]?.id as string;
  expect(profileId).toBeDefined();

  const profileLoginRes = await request(httpServer)
    .post('/auth/login/profile')
    .set('Authorization', `Bearer ${tempToken}`)
    .send({ profileId });
  expect([200, 201]).toContain(profileLoginRes.status);

  const accessToken = profileLoginRes.body?.data?.accessToken as string;
  expect(accessToken).toBeDefined();

  return { accessToken, profileId };
}

async function ensureProvider(ds: DataSource): Promise<ProvidersEntity> {
  const repo = ds.getRepository(ProvidersEntity);
  let provider = await repo.findOne({ where: { slug: 'e2e-provider-series' } });
  if (!provider) {
    provider = repo.create({
      name: 'E2E Provider Series',
      slug: 'e2e-provider-series',
      baseUrl: 'https://e2e-provider-series.example.com',
      isActive: true,
    });
    provider = await repo.save(provider);
  }
  return provider;
}

function buildSeriesData(
  provider: ProvidersEntity,
  overrides: DeepPartial<Movie> = {},
): DeepPartial<Movie> {
  const unique = Date.now().toString();
  return {
    title: `E2E Series ${unique}`,
    providerId: provider.id,
    providerTitleId: `prov-series-${unique}`,
    programType: 'TV Show',
    synopsis: 'E2E series synopsis',
    productionYear: '2024',
    marketRating: 'TV-14',
    isHD: true,
    director: 'E2E Director',
    cast: ['Actor A', 'Actor B'],
    genres: ['sci-fi', 'adventure'],
    languages: ['English'],
    duration: '45 min',
    isPremium: false,
    images: {
      poster: 'https://example.com/series-poster.jpg',
      posterLandscape: 'https://example.com/series-poster-land.jpg',
      thumbnail: 'https://example.com/series-thumb.jpg',
    },
    contentType: MovieContentType.SERIES,
    mediaKeys: { trailer: 'simpsons/trailer/variants/simpsons_master.m3u8' },
    ...overrides,
  };
}

function buildEpisodeData(
  provider: ProvidersEntity,
  seriesId: string,
  season: number,
  episode: number,
  overrides: DeepPartial<Movie> = {},
): DeepPartial<Movie> {
  const unique = `${Date.now()}-${season}-${episode}`;
  return {
    title: `E2E Series S${season}E${episode}`,
    providerId: provider.id,
    providerTitleId: `prov-episode-${unique}`,
    programType: 'TV Episode',
    synopsis: `Episode ${episode} synopsis`,
    productionYear: '2024',
    marketRating: 'TV-14',
    isHD: true,
    director: 'E2E Director',
    cast: ['Actor A', 'Actor B'],
    genres: ['sci-fi', 'adventure'],
    languages: ['English'],
    duration: '45 min',
    isPremium: false,
    images: {
      poster: 'https://example.com/episode-poster.jpg',
      posterLandscape: 'https://example.com/episode-poster-land.jpg',
      thumbnail: 'https://example.com/episode-thumb.jpg',
    },
    contentType: MovieContentType.EPISODE,
    seriesId,
    seasonNumber: season,
    episodeNumber: episode,
    mediaKeys: {
      main: 'fast-6/trailer/variants/fast6_master.m3u8',
      trailer: 'fast-6/trailer/variants/fast6_master.m3u8',
    },
    ...overrides,
  };
}

function buildFilmData(
  provider: ProvidersEntity,
  overrides: DeepPartial<Movie> = {},
): DeepPartial<Movie> {
  const unique = Date.now().toString();
  return {
    title: `E2E Film ${unique}`,
    providerId: provider.id,
    providerTitleId: `prov-film-${unique}`,
    programType: 'Movie',
    synopsis: 'E2E film synopsis',
    productionYear: '2024',
    marketRating: 'PG-13',
    isHD: true,
    director: 'E2E Director',
    cast: ['Actor A', 'Actor B'],
    genres: ['sci-fi', 'adventure'],
    languages: ['English'],
    duration: '120 min',
    isPremium: false,
    images: {
      poster: 'https://example.com/film-poster.jpg',
      posterLandscape: 'https://example.com/film-poster-land.jpg',
      thumbnail: 'https://example.com/film-thumb.jpg',
    },
    contentType: MovieContentType.FILM,
    mediaKeys: { main: 'film/main/variants/film_master.m3u8' },
    ...overrides,
  };
}

async function seedSeriesWithEpisodes(
  ds: DataSource,
  provider: ProvidersEntity,
  episodeCount = 3,
): Promise<{ series: Movie; episodes: Movie[] }> {
  const repo: Repository<Movie> = ds.getRepository(Movie);
  const seriesData = buildSeriesData(provider);
  const seriesEntity = repo.create(seriesData as DeepPartial<Movie>) as Movie;
  const series = await repo.save(seriesEntity);

  const episodes: Movie[] = [];
  for (let i = 1; i <= episodeCount; i++) {
    const epData = buildEpisodeData(provider, series.id, 1, i);
    const epEntity = repo.create(epData as DeepPartial<Movie>) as Movie;
    episodes.push(await repo.save(epEntity));
  }
  return { series, episodes };
}

describe('Movie Series Endpoints (e2e)', () => {
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

    try {
      const scheduler = app.get(SchedulerRegistry);
      const jobs = scheduler.getCronJobs?.();
      if (jobs && typeof jobs.forEach === 'function') {
        jobs.forEach((job) => {
          try {
            job.stop();
          } catch {}
        });
      }
    } catch {}

    httpServer = app.getHttpServer();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should require auth for series endpoints', async () => {
    await request(httpServer).get('/movie/series').expect(401);
    await request(httpServer)
      .get('/movie/series/00000000-0000-0000-0000-000000000000')
      .expect(401);
    await request(httpServer)
      .get('/movie/series/00000000-0000-0000-0000-000000000000/episodes')
      .expect(401);
  });

  it('should list series (paginated) and return correct envelope', async () => {
    const { accessToken } = await createAndLoginUserWithProfile(httpServer);
    const provider = await ensureProvider(ds);
    await seedSeriesWithEpisodes(ds, provider, 3);

    const res = await request(httpServer)
      .get('/movie/series')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 2, page: 1, sortBy: 'dateCreated:DESC' })
      .expect(200);

    expect(res.body?.data).toBeDefined();
    expect(res.body?.data?.data).toBeDefined();
    expect(res.body?.data?.meta).toBeDefined();
    expect(res.body?.data?.links).toBeDefined();

    const first = res.body?.data?.data?.[0];
    if (first) {
      expect(first.contentType).toBe('series');
      expect(first.title).toBeDefined();
      expect(first.images).toBeDefined();
      expect(typeof first.isInMyList).toBe('boolean');
    }
  });

  it('should return series detail with episodes, respecting media key policies', async () => {
    const { accessToken, profileId } =
      await createAndLoginUserWithProfile(httpServer);
    const provider = await ensureProvider(ds);
    const { series } = await seedSeriesWithEpisodes(ds, provider, 3);

    const res = await request(httpServer)
      .get(`/movie/series/${series.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const payload = res.body?.data;
    expect(payload?.series?.id).toBe(series.id);
    expect(payload?.series?.contentType).toBe('series');
    expect(payload?.series?.mediaKeys?.main).toBeUndefined();

    const episodes = payload?.episodes ?? [];
    expect(Array.isArray(episodes)).toBe(true);
    expect(episodes.length).toBeGreaterThanOrEqual(1);
    const ep = episodes[0];
    expect(ep?.contentType).toBe('episode');
    expect(ep?.mediaKeys?.main).toBeDefined();
    expect(typeof ep?.isInMyList).toBe('boolean');

    const myListRepo = ds.getRepository(MyListEntity);
    await myListRepo.save(myListRepo.create({ profileId, movieId: series.id }));

    const res2 = await request(httpServer)
      .get(`/movie/series/${series.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const episodes2 = res2.body?.data?.episodes ?? [];
    for (const e of episodes2) {
      expect(e?.isInMyList).toBe(true);
    }
  });

  it('should paginate episodes list with envelope and ordering fields', async () => {
    const { accessToken } = await createAndLoginUserWithProfile(httpServer);
    const provider = await ensureProvider(ds);
    const { series } = await seedSeriesWithEpisodes(ds, provider, 5);

    const page1 = await request(httpServer)
      .get(`/movie/series/${series.id}/episodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        limit: 2,
        page: 1,
        sortBy: 'seasonNumber:ASC,episodeNumber:ASC',
      })
      .expect(200);

    expect(page1.body?.data?.data?.length).toBeLessThanOrEqual(2);
    expect(
      page1.body?.data?.meta?.itemsPerPage ?? page1.body?.data?.meta?.limit,
    ).toBe(2);
    expect(
      page1.body?.data?.meta?.currentPage ?? page1.body?.data?.meta?.page,
    ).toBe(1);

    const page2 = await request(httpServer)
      .get(`/movie/series/${series.id}/episodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 2, page: 2 })
      .expect(200);

    expect(
      page2.body?.data?.meta?.currentPage ?? page2.body?.data?.meta?.page,
    ).toBe(2);
    const item = page2.body?.data?.data?.[0];
    if (item) {
      expect(item.seasonNumber).toBeDefined();
      expect(item.episodeNumber).toBeDefined();
      expect(item.mediaKeys?.main).toBeDefined();
    }
  });

  it('should return movies list with contentType and correct episodes by type', async () => {
    const { accessToken } = await createAndLoginUserWithProfile(httpServer);
    const provider = await ensureProvider(ds);
    const { series, episodes } = await seedSeriesWithEpisodes(ds, provider, 3);

    const filmRepo: Repository<Movie> = ds.getRepository(Movie);
    const filmEntity = filmRepo.create(
      buildFilmData(provider) as DeepPartial<Movie>,
    ) as Movie;
    const film = await filmRepo.save(filmEntity);

    // Search for items by a shared genre to get both film and series in one page
    const res = await request(httpServer)
      .get('/movie')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 10, page: 1, search: 'sci-fi' })
      .expect(200);

    const items: any[] = res.body?.data?.data ?? [];
    expect(Array.isArray(items)).toBe(true);

    const seriesItem = items.find((m) => m.id === series.id);
    const filmItem = items.find((m) => m.id === film.id);

    expect(seriesItem).toBeDefined();
    expect(seriesItem.contentType).toBe('series');
    expect(Array.isArray(seriesItem.episodes)).toBe(true);
    expect(seriesItem.episodes.length).toBeGreaterThanOrEqual(episodes.length);
    expect(seriesItem.episodes[0]?.contentType).toBe('episode');

    expect(filmItem).toBeDefined();
    expect(filmItem.contentType).toBe('film');
    expect(Array.isArray(filmItem.episodes)).toBe(true);
    expect(filmItem.episodes.length).toBe(0);

    // Ensure top-level items never include episodes
    expect(items.some((m) => m.contentType === 'episode')).toBe(false);

    // Validate episode object returned by single movie endpoint has empty episodes and correct contentType
    const episodeId = episodes[0].id;
    const singleEpisodeRes = await request(httpServer)
      .get(`/movie/${episodeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const singleEpisode = singleEpisodeRes.body?.data;
    expect(singleEpisode?.contentType).toBe('episode');
    expect(Array.isArray(singleEpisode?.episodes)).toBe(true);
    expect(singleEpisode?.episodes?.length).toBe(0);
  });

  it('should return related movies without episode items; series attach episodes', async () => {
    const { accessToken } = await createAndLoginUserWithProfile(httpServer);
    const provider = await ensureProvider(ds);
    const { series } = await seedSeriesWithEpisodes(ds, provider, 3);

    const res = await request(httpServer)
      .get(`/recommendation/movie/${series.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 5 })
      .expect(200);

    const related: any[] = res.body?.data ?? res.body?.data?.data ?? [];
    expect(Array.isArray(related)).toBe(true);

    // No episode items at top level
    expect(related.some((m) => m.contentType === 'episode')).toBe(false);
    // Series still attach episodes
    for (const m of related) {
      if (m.contentType === 'series') {
        expect(Array.isArray(m.episodes)).toBe(true);
        expect(m.episodes.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(Array.isArray(m.episodes)).toBe(true);
        expect(m.episodes.length).toBe(0);
      }
    }
  });

  it('should exclude episodes from genre-based listing', async () => {
    const { accessToken } = await createAndLoginUserWithProfile(httpServer);
    const provider = await ensureProvider(ds);
    const { series } = await seedSeriesWithEpisodes(ds, provider, 3);
    const filmRepo: Repository<Movie> = ds.getRepository(Movie);
    await filmRepo.save(
      filmRepo.create(
        buildFilmData(provider, { genres: ['sci-fi', 'adventure'] }),
      ) as Movie,
    );

    const byGenre = await request(httpServer)
      .get('/movie/genres/sci-fi')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const genreItems: any[] =
      byGenre.body?.data?.data ?? byGenre.body?.data ?? [];
    expect(Array.isArray(genreItems)).toBe(true);
    expect(genreItems.some((m) => m.contentType === 'episode')).toBe(false);
  });
});
