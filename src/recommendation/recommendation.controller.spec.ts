import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { EmailCampaignStatus } from './entities/email-campaign-job.entity';

describe('RecommendationController', () => {
  let controller: RecommendationController;
  let service: {
    getRecommendationsForUser: jest.Mock;
    getRelatedMovies: jest.Mock;
    triggerSimilarityComputation: jest.Mock;
    sendRecommendationEmails: jest.Mock;
    getEmailCampaignJobStatus: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getRecommendationsForUser: jest.fn(),
      getRelatedMovies: jest.fn(),
      triggerSimilarityComputation: jest.fn(),
      sendRecommendationEmails: jest.fn(),
      getEmailCampaignJobStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationController],
      providers: [
        { provide: RecommendationService, useValue: service },
      ],
    }).compile();

    controller = module.get<RecommendationController>(RecommendationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── sendRecommendationEmails ───────────────────────────────────────

  describe('sendRecommendationEmails', () => {
    it('should queue a campaign with default limit and no userIds', async () => {
      service.sendRecommendationEmails.mockResolvedValue({
        jobId: 'job-1',
        totalUsers: 100,
      });

      const result = await controller.sendRecommendationEmails(undefined, undefined);

      expect(service.sendRecommendationEmails).toHaveBeenCalledWith(5, undefined);
      expect(result).toEqual({
        message: 'Recommendation email campaign queued',
        data: { jobId: 'job-1', totalUsers: 100 },
      });
    });

    it('should pass custom limit and userIds to the service', async () => {
      service.sendRecommendationEmails.mockResolvedValue({
        jobId: 'job-2',
        totalUsers: 3,
      });

      const result = await controller.sendRecommendationEmails('8', {
        userIds: ['u1', 'u2', 'u3'],
      });

      expect(service.sendRecommendationEmails).toHaveBeenCalledWith(8, [
        'u1',
        'u2',
        'u3',
      ]);
      expect(result.data.totalUsers).toBe(3);
    });

    it('should throw BadRequestException when limit is below 1', async () => {
      await expect(
        controller.sendRecommendationEmails('0', undefined),
      ).rejects.toThrow(BadRequestException);

      expect(service.sendRecommendationEmails).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when limit is above 10', async () => {
      await expect(
        controller.sendRecommendationEmails('15', undefined),
      ).rejects.toThrow(BadRequestException);

      expect(service.sendRecommendationEmails).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-numeric limit', async () => {
      // parseInt('abc', 10) returns NaN, which is < 1
      await expect(
        controller.sendRecommendationEmails('abc', undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass undefined userIds when body is empty object', async () => {
      service.sendRecommendationEmails.mockResolvedValue({
        jobId: 'job-3',
        totalUsers: 50,
      });

      await controller.sendRecommendationEmails('5', {});

      expect(service.sendRecommendationEmails).toHaveBeenCalledWith(
        5,
        undefined,
      );
    });
  });

  // ─── getEmailCampaignStatus ─────────────────────────────────────────

  describe('getEmailCampaignStatus', () => {
    it('should return the job status from the service', async () => {
      const jobStatus = {
        id: 'job-1',
        status: EmailCampaignStatus.PROCESSING,
        emailsSent: 25,
        emailsFailed: 1,
        totalUsers: 100,
      };
      service.getEmailCampaignJobStatus.mockResolvedValue(jobStatus);

      const result = await controller.getEmailCampaignStatus('job-1');

      expect(result).toEqual(jobStatus);
      expect(service.getEmailCampaignJobStatus).toHaveBeenCalledWith('job-1');
    });

    it('should propagate NotFoundException from the service', async () => {
      service.getEmailCampaignJobStatus.mockRejectedValue(
        new (require('@nestjs/common').NotFoundException)('Job not-found not found'),
      );

      await expect(
        controller.getEmailCampaignStatus('not-found'),
      ).rejects.toThrow('Job not-found not found');
    });
  });
});
