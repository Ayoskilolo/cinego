import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { Movie } from '../movie/entities/movie.entity';
import { Review } from '../review/entities/review.entity';
import { WatchHistory } from '../user/entities/watch-history.entity';
import { MyListEntity } from '../my-list/entities/my-list.entity';
import { Profile } from '../user/entities/profile.entity';
import { User } from '../user/entities/user.entity';
import { SessionEntity } from '../auth/entities/session.entity';
import { ItemSimilarity } from './entities/item-similarity.entity';
import {
  EmailCampaignJob,
  EmailCampaignStatus,
} from './entities/email-campaign-job.entity';
import { MyListService } from '../my-list/my-list.service';
import { MailService } from '../mail/mail.service';
import { MovieContentType } from '../movie/enums/movie-content-type.enum';

// --- Helpers ---

const mockUser = (overrides: Partial<User> = {}): Partial<User> => ({
  id: 'user-1',
  firstName: 'John',
  email: 'john@example.com',
  isEmailVerified: true,
  profiles: [
    {
      id: 'profile-1',
      userId: 'user-1',
      contentProfileJSON: { 'genre:Action': 5 },
      contentProfileUpdatedAt: new Date(),
    } as any,
  ],
  ...overrides,
});

const mockMovie = (overrides: Partial<Movie> = {}): Partial<Movie> => ({
  id: 'movie-1',
  title: 'Test Movie',
  contentType: MovieContentType.FILM,
  genres: ['Action'],
  cast: ['Actor A'],
  synopsis: 'A great movie about testing.',
  productionYear: '2025',
  duration: '120 min',
  marketRating: 'PG-13',
  images: { poster: 'https://img.test/poster.jpg', posterLandscape: '', thumbnail: '' },
  dateCreated: new Date(),
  ...overrides,
});

const mockJob = (overrides: Partial<EmailCampaignJob> = {}): Partial<EmailCampaignJob> => ({
  id: 'job-1',
  status: EmailCampaignStatus.PENDING,
  movieLimit: 5,
  userIds: null,
  totalUsers: 1,
  emailsSent: 0,
  emailsFailed: 0,
  startedAt: null,
  errorMessage: null,
  completedAt: null,
  dateCreated: new Date(),
  ...overrides,
});

// --- Mock repositories ---

const createMockRepository = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  create: jest.fn().mockImplementation((entity) => entity),
  update: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw: [] }),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
});

describe('RecommendationService', () => {
  let service: RecommendationService;
  let userRepo: ReturnType<typeof createMockRepository>;
  let movieRepo: ReturnType<typeof createMockRepository>;
  let reviewRepo: ReturnType<typeof createMockRepository>;
  let watchHistoryRepo: ReturnType<typeof createMockRepository>;
  let profileRepo: ReturnType<typeof createMockRepository>;
  let sessionRepo: ReturnType<typeof createMockRepository>;
  let jobRepo: ReturnType<typeof createMockRepository>;
  let itemSimilarityRepo: ReturnType<typeof createMockRepository>;
  let myListRepo: ReturnType<typeof createMockRepository>;
  let mailService: { sendMovieRecommendationMail: jest.Mock };
  let myListService: { getMyListItemsBatch: jest.Mock };

  beforeEach(async () => {
    userRepo = createMockRepository();
    movieRepo = createMockRepository();
    reviewRepo = createMockRepository();
    watchHistoryRepo = createMockRepository();
    profileRepo = createMockRepository();
    sessionRepo = createMockRepository();
    jobRepo = createMockRepository();
    itemSimilarityRepo = createMockRepository();
    myListRepo = createMockRepository();
    mailService = { sendMovieRecommendationMail: jest.fn().mockResolvedValue(true) };
    myListService = { getMyListItemsBatch: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: getRepositoryToken(Movie), useValue: movieRepo },
        { provide: getRepositoryToken(Review), useValue: reviewRepo },
        { provide: getRepositoryToken(WatchHistory), useValue: watchHistoryRepo },
        { provide: getRepositoryToken(MyListEntity), useValue: myListRepo },
        { provide: getRepositoryToken(Profile), useValue: profileRepo },
        { provide: getRepositoryToken(ItemSimilarity), useValue: itemSimilarityRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(SessionEntity), useValue: sessionRepo },
        { provide: getRepositoryToken(EmailCampaignJob), useValue: jobRepo },
        { provide: MyListService, useValue: myListService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<RecommendationService>(RecommendationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── sendRecommendationEmails ───────────────────────────────────────

  describe('sendRecommendationEmails', () => {
    it('should create a job and return jobId for all users', async () => {
      userRepo.count.mockResolvedValue(50);
      jobRepo.save.mockImplementation((entity) =>
        Promise.resolve({ ...entity, id: 'job-new' }),
      );

      const result = await service.sendRecommendationEmails(5);

      expect(result.jobId).toBe('job-new');
      expect(result.totalUsers).toBe(50);
      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EmailCampaignStatus.PENDING,
          movieLimit: 5,
          userIds: null,
          totalUsers: 50,
        }),
      );
    });

    it('should create a job scoped to specific userIds', async () => {
      userRepo.count.mockResolvedValue(2);
      jobRepo.save.mockImplementation((entity) =>
        Promise.resolve({ ...entity, id: 'job-targeted' }),
      );

      const result = await service.sendRecommendationEmails(3, [
        'user-1',
        'user-2',
      ]);

      expect(result.jobId).toBe('job-targeted');
      expect(result.totalUsers).toBe(2);
      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['user-1', 'user-2'],
        }),
      );
    });

    it('should throw BadRequestException when targeted userIds match no verified users', async () => {
      userRepo.count.mockResolvedValue(0);

      await expect(
        service.sendRecommendationEmails(5, ['nonexistent-uuid']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a job with totalUsers = 0 when no verified users exist (all-users mode)', async () => {
      userRepo.count.mockResolvedValue(0);
      jobRepo.save.mockImplementation((entity) =>
        Promise.resolve({ ...entity, id: 'job-empty' }),
      );

      const result = await service.sendRecommendationEmails(5);

      expect(result.totalUsers).toBe(0);
      expect(jobRepo.create).toHaveBeenCalled();
    });
  });

  // ─── processEmailCampaignJobs (cron poller) ─────────────────────────

  describe('processEmailCampaignJobs', () => {
    it('should do nothing when no pending jobs exist', async () => {
      // The atomic claim returns no rows
      jobRepo.createQueryBuilder().execute.mockResolvedValue({ raw: [] });

      await service.processEmailCampaignJobs();

      expect(mailService.sendMovieRecommendationMail).not.toHaveBeenCalled();
    });

    it('should claim a pending job, process it, and mark it completed', async () => {
      const job = mockJob();
      const user = mockUser();
      const movie = mockMovie();

      // First createQueryBuilder call: stale recovery (runs, affects nothing)
      // Second createQueryBuilder call: atomic claim
      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          // First call: stale recovery
          .mockResolvedValueOnce({ raw: [] })
          // Second call: atomic claim returns the job
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([user]);
      movieRepo.find.mockResolvedValue([movie]);
      sessionRepo.findOne.mockResolvedValue({ currentProfileId: 'profile-1' });
      profileRepo.findOne.mockResolvedValue(user.profiles[0]);
      reviewRepo.find.mockResolvedValue([]);
      watchHistoryRepo.find.mockResolvedValue([]);
      itemSimilarityRepo.find.mockResolvedValue([]);

      // myList counts query builder
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      // episodes query builder on movieRepo (for enrichMoviesWithMyListData isn't called here)

      await service.processEmailCampaignJobs();

      expect(jobRepo.findOne).toHaveBeenCalledWith({ where: { id: 'job-1' } });
      expect(mailService.sendMovieRecommendationMail).toHaveBeenCalledWith(
        'john@example.com',
        expect.objectContaining({
          recipientName: 'John',
          movies: expect.arrayContaining([
            expect.objectContaining({ title: 'Test Movie' }),
          ]),
        }),
      );

      // Should save completed status
      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EmailCampaignStatus.COMPLETED,
          emailsSent: 1,
        }),
      );
    });

    it('should mark job as FAILED when an error occurs during processing', async () => {
      const job = mockJob();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      // Make user loading throw
      userRepo.find.mockRejectedValue(new Error('DB connection lost'));

      await service.processEmailCampaignJobs();

      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EmailCampaignStatus.FAILED,
          errorMessage: 'DB connection lost',
        }),
      );
    });

    it('should skip users with no profiles', async () => {
      const job = mockJob();
      const userNoProfiles = mockUser({ profiles: [] });

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([userNoProfiles]);
      movieRepo.find.mockResolvedValue([mockMovie()]);
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      await service.processEmailCampaignJobs();

      expect(mailService.sendMovieRecommendationMail).not.toHaveBeenCalled();
      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EmailCampaignStatus.COMPLETED,
          emailsSent: 0,
          emailsFailed: 0,
        }),
      );
    });

    it('should use popular movies fallback for users with no taste profile', async () => {
      const job = mockJob();
      const user = mockUser({
        profiles: [
          {
            id: 'profile-1',
            userId: 'user-1',
            contentProfileJSON: null,
            contentProfileUpdatedAt: null,
          } as any,
        ],
      });
      const movie = mockMovie({ id: 'popular-1' });

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { movieId: 'popular-1', count: '10' },
        ]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([user]);
      movieRepo.find.mockResolvedValue([movie]);
      sessionRepo.findOne.mockResolvedValue(null);

      // updateUserProfile will be called, then profileRepo.findOne returns empty profile
      profileRepo.findOne.mockResolvedValue({
        id: 'profile-1',
        contentProfileJSON: {},
        contentProfileUpdatedAt: new Date(),
      });

      reviewRepo.find.mockResolvedValue([]);
      watchHistoryRepo.find.mockResolvedValue([]);

      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { movieId: 'popular-1', count: '10' },
        ]),
      });
      myListRepo.find = jest.fn().mockResolvedValue([]);

      await service.processEmailCampaignJobs();

      // Should still send an email with the popular movie
      expect(mailService.sendMovieRecommendationMail).toHaveBeenCalledWith(
        'john@example.com',
        expect.objectContaining({
          movies: expect.arrayContaining([
            expect.objectContaining({ title: 'Test Movie' }),
          ]),
        }),
      );
    });

    it('should use last active session profile when available', async () => {
      const job = mockJob();
      const user = mockUser({
        profiles: [
          { id: 'profile-old', userId: 'user-1', contentProfileJSON: { 'genre:Drama': 2 }, contentProfileUpdatedAt: new Date() } as any,
          { id: 'profile-active', userId: 'user-1', contentProfileJSON: { 'genre:Action': 8 }, contentProfileUpdatedAt: new Date() } as any,
        ],
      });
      const movie = mockMovie();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([user]);
      movieRepo.find.mockResolvedValue([movie]);
      sessionRepo.findOne.mockResolvedValue({ currentProfileId: 'profile-active' });
      profileRepo.findOne.mockResolvedValue(user.profiles[1]);
      reviewRepo.find.mockResolvedValue([]);
      watchHistoryRepo.find.mockResolvedValue([]);
      itemSimilarityRepo.find.mockResolvedValue([]);
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      await service.processEmailCampaignJobs();

      // profileRepo.findOne should have been called with the active profile
      expect(profileRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'profile-active' } }),
      );
    });

    it('should fall back to first profile when no session exists', async () => {
      const job = mockJob();
      const user = mockUser();
      const movie = mockMovie();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([user]);
      movieRepo.find.mockResolvedValue([movie]);
      sessionRepo.findOne.mockResolvedValue(null); // no session
      profileRepo.findOne.mockResolvedValue(user.profiles[0]);
      reviewRepo.find.mockResolvedValue([]);
      watchHistoryRepo.find.mockResolvedValue([]);
      itemSimilarityRepo.find.mockResolvedValue([]);
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      await service.processEmailCampaignJobs();

      expect(profileRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'profile-1' } }),
      );
    });

    it('should count emailsFailed when mailService returns false', async () => {
      const job = mockJob();
      const user = mockUser();
      const movie = mockMovie();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([user]);
      movieRepo.find.mockResolvedValue([movie]);
      sessionRepo.findOne.mockResolvedValue({ currentProfileId: 'profile-1' });
      profileRepo.findOne.mockResolvedValue(user.profiles[0]);
      reviewRepo.find.mockResolvedValue([]);
      watchHistoryRepo.find.mockResolvedValue([]);
      itemSimilarityRepo.find.mockResolvedValue([]);
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      mailService.sendMovieRecommendationMail.mockResolvedValue(false);

      await service.processEmailCampaignJobs();

      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EmailCampaignStatus.COMPLETED,
          emailsSent: 0,
          emailsFailed: 1,
        }),
      );
    });

    it('should only include FILM and SERIES content types in movie query', async () => {
      const job = mockJob();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([]);
      movieRepo.find.mockResolvedValue([]);
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      await service.processEmailCampaignJobs();

      expect(movieRepo.find).toHaveBeenCalledWith({
        where: [
          { contentType: MovieContentType.FILM },
          { contentType: MovieContentType.SERIES },
        ],
      });
    });

    it('should fall back to newest movies when no MyList counts exist', async () => {
      const job = mockJob();
      const newMovie = mockMovie({ id: 'new-1', dateCreated: new Date('2026-04-20') });
      const oldMovie = mockMovie({ id: 'old-1', dateCreated: new Date('2025-01-01') });
      const user = mockUser({
        profiles: [
          { id: 'profile-1', userId: 'user-1', contentProfileJSON: null, contentProfileUpdatedAt: null } as any,
        ],
      });

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn()
          .mockResolvedValueOnce({ raw: [] })
          .mockResolvedValueOnce({ raw: [{ id: 'job-1' }] }),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]), // empty MyList counts
      };
      jobRepo.createQueryBuilder.mockReturnValue(qbMock);
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      userRepo.find.mockResolvedValue([user]);
      movieRepo.find.mockResolvedValue([newMovie, oldMovie]);
      sessionRepo.findOne.mockResolvedValue(null);
      profileRepo.findOne.mockResolvedValue({
        id: 'profile-1',
        contentProfileJSON: {},
        contentProfileUpdatedAt: new Date(),
      });

      reviewRepo.find.mockResolvedValue([]);
      watchHistoryRepo.find.mockResolvedValue([]);
      myListRepo.find = jest.fn().mockResolvedValue([]);
      myListRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      await service.processEmailCampaignJobs();

      // Should send email with the newest movie (new-1 is more recent)
      expect(mailService.sendMovieRecommendationMail).toHaveBeenCalledWith(
        'john@example.com',
        expect.objectContaining({
          movies: expect.arrayContaining([
            expect.objectContaining({ title: 'Test Movie' }),
          ]),
        }),
      );
    });
  });

  // ─── getEmailCampaignJobStatus ──────────────────────────────────────

  describe('getEmailCampaignJobStatus', () => {
    it('should return the job when found', async () => {
      const job = mockJob({ status: EmailCampaignStatus.COMPLETED, emailsSent: 50 });
      jobRepo.findOne.mockResolvedValue(job);

      const result = await service.getEmailCampaignJobStatus('job-1');

      expect(result).toEqual(job);
      expect(jobRepo.findOne).toHaveBeenCalledWith({ where: { id: 'job-1' } });
    });

    it('should throw NotFoundException when job does not exist', async () => {
      jobRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getEmailCampaignJobStatus('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
