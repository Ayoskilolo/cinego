import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { DataSource, DeepPartial, Repository } from 'typeorm'
import { ProvidersEntity } from '../src/providers/entities/providers.entity'
import { Movie } from '../src/movie/entities/movie.entity'
import { SchedulerRegistry } from '@nestjs/schedule'

async function adminLogin(httpServer: any): Promise<string> {
  const res = await request(httpServer)
    .post('/auth/admin/login')
    .send({ email: 'admin@cinego.com', password: 'admin123' })
  expect([200, 201]).toContain(res.status)
  const token = res.body?.data?.accessToken
  expect(token).toBeDefined()
  return token
}

async function ensureProvider(ds: DataSource): Promise<ProvidersEntity> {
  const repo = ds.getRepository(ProvidersEntity)
  let provider = await repo.findOne({ where: { slug: 'e2e-provider' } })
  if (!provider) {
    provider = repo.create({
      name: 'E2E Provider',
      slug: 'e2e-provider',
      baseUrl: 'https://e2e-provider.example.com',
      isActive: true,
    })
    provider = await repo.save(provider)
  }
  return provider
}

function buildMovieData(
  provider: ProvidersEntity,
  overrides: DeepPartial<Movie> = {},
): DeepPartial<Movie> {
  const unique = Date.now().toString()
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
  }
}

async function seedMovie(
  ds: DataSource,
  provider: ProvidersEntity,
  overrides: DeepPartial<Movie> = {},
): Promise<Movie> {
  const repo: Repository<Movie> = ds.getRepository(Movie)
  const data: DeepPartial<Movie> = buildMovieData(provider, overrides)
  const entity: Movie = repo.create(data as DeepPartial<Movie>) as Movie
  return await repo.save(entity)
}

describe('Admin Movie News (e2e)', () => {
  let app: INestApplication
  let httpServer: any
  let ds: DataSource

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }))
    await app.init()

    // stop cron jobs
    try {
      const scheduler = app.get(SchedulerRegistry)
      const jobs = scheduler.getCronJobs?.()
      if (jobs && typeof jobs.forEach === 'function') {
        jobs.forEach((job) => {
          try {
            job.stop()
          } catch {}
        })
      }
    } catch {}

    httpServer = app.getHttpServer()
    ds = app.get(DataSource)
  })

  afterAll(async () => {
    await app.close()
  })

  describe('Auth and RBAC', () => {
    it('GET /admin/movie-news requires auth (401)', async () => {
      await request(httpServer).get('/admin/movie-news').expect(401)
    })
  })

  describe('CRUD tied to movieId', () => {
    it('creates, lists (filter by movieId), gets, updates and deletes a movie news item', async () => {
      const token = await adminLogin(httpServer)

      // Ensure provider and seed a movie
      const provider = await ensureProvider(ds)
      const movie = await seedMovie(ds, provider)

      // create news
      const createRes = await request(httpServer)
        .post('/admin/movie-news')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Admin E2E Movie News',
          content: 'Initial news content',
          author: 'E2E Bot',
          description: 'Init desc',
          movieId: movie.id,
        })
        .expect([200, 201] as any)

      const created = createRes.body?.data ?? createRes.body
      const id = created?.id
      expect(id).toBeDefined()
      expect(created?.movieId).toBe(movie.id)

      // list and filter by movieId
      const listRes = await request(httpServer)
        .get(`/admin/movie-news?filter=movieId:${movie.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      expect(listRes.body).toHaveProperty('data')
      const dataField = listRes.body.data
      const items = Array.isArray(dataField)
        ? dataField
        : Array.isArray(dataField?.items)
        ? dataField.items
        : Array.isArray(dataField?.data)
        ? dataField.data
        : []
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBeGreaterThanOrEqual(1)
      expect(items.some((item: any) => item.id === id)).toBe(true)

      // get by id
      const getRes = await request(httpServer)
        .get(`/admin/movie-news/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      expect(getRes.body?.data?.id ?? getRes.body?.id).toBe(id)

      // update
      const updateRes = await request(httpServer)
        .patch(`/admin/movie-news/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Admin E2E Movie News Updated' })
        .expect(200)
      expect((updateRes.body?.data ?? updateRes.body)?.title).toBe(
        'Admin E2E Movie News Updated',
      )

      // delete
      await request(httpServer)
        .delete(`/admin/movie-news/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204)

      // verify not found
      await request(httpServer)
        .get(`/admin/movie-news/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })
  })
})