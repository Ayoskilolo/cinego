import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
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

describe('Admin Blogs (e2e)', () => {
  let app: INestApplication
  let httpServer: any

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    )
    await app.init()

    // stop cron jobs
    const scheduler = app.get(SchedulerRegistry)
    try {
      const cronJobs = scheduler.getCronJobs()
      cronJobs.forEach((job) => job.stop())
    } catch {}

    httpServer = app.getHttpServer()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('Auth and RBAC', () => {
    it('GET /admin/blogs requires auth (401)', async () => {
      await request(httpServer).get('/admin/blogs').expect(401)
    })
  })

  describe('List endpoint', () => {
    it('returns items, meta, links shape', async () => {
      const token = await adminLogin(httpServer)
      const res = await request(httpServer)
        .get('/admin/blogs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(res.body).toHaveProperty('data')
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('meta')
      expect(res.body.data).toHaveProperty('links')
    })

    it('supports pagination params and sorting by createdAt', async () => {
      const token = await adminLogin(httpServer)
      await request(httpServer)
        .get('/admin/blogs?page=1&limit=5&sortBy=createdAt:DESC')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    })
  })

  describe('CRUD', () => {
    it('creates, gets, updates and deletes a blog item', async () => {
      const token = await adminLogin(httpServer)

      // create
      const createRes = await request(httpServer)
        .post('/admin/blogs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Admin E2E Blog',
          content: 'Initial content',
          author: 'E2E Bot',
          description: 'Init desc',
        })
        .expect([200, 201] as any)

      const created = createRes.body?.data ?? createRes.body // service may return raw entity
      const id = created?.id
      expect(id).toBeDefined()

      // get by id
      const getRes = await request(httpServer)
        .get(`/admin/blogs/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      expect(getRes.body?.data?.id ?? getRes.body?.id).toBe(id)

      // update
      const updateRes = await request(httpServer)
        .patch(`/admin/blogs/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Admin E2E Blog Updated' })
        .expect(200)
      expect((updateRes.body?.data ?? updateRes.body)?.title).toBe(
        'Admin E2E Blog Updated',
      )

      // delete
      await request(httpServer)
        .delete(`/admin/blogs/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204)

      // verify not found
      await request(httpServer)
        .get(`/admin/blogs/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })
  })
})
