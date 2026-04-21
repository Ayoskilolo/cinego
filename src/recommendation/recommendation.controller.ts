import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  BadRequestException,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RecommendationService } from './recommendation.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { SendRecommendationEmailsDto } from './dto/send-recommendation-emails.dto';
import { EmailCampaignStatus } from './entities/email-campaign-job.entity';
import { StructuredResponse } from '../response/structured-response';

@ApiTags('Recommendations')
@ApiBearerAuth()
@Controller('recommendation')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  /**
   * Get personalized movie recommendations for a user
   *
   * This endpoint combines two types of recommendations:
   * - "You might also like": Based on your viewing history and preferences
   * - "People like you also like": Based on what similar users enjoyed
   *
   * @param profileId - The user's profile ID (must belong to the authenticated user)
   * @param limit - Number of recommendations to return (default: 10, max: 50)
   * @param contentWeight - Balance between "you might also like" vs "people like you also like" (0.0-1.0, default: 0.5)
   *   - 0.0 = Pure "people like you also like" (discoveries)
   *   - 0.5 = Balanced approach (default)
   *   - 1.0 = Pure "you might also like" (more of what you already enjoy)
   */
  @Get('user/:profileId')
  @ApiOperation({
    summary: 'Get personalized movie recommendations',
    description:
      'Get movie recommendations tailored to your viewing history and preferences. Combines "you might also like" suggestions with "people like you also like" discoveries.',
  })
  @ApiParam({
    name: 'profileId',
    description:
      'The profile ID to get recommendations for (must belong to authenticated user)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of recommendations to return (1-50)',
    example: 10,
    type: Number,
  })
  @ApiQuery({
    name: 'contentWeight',
    required: false,
    description:
      'Balance between personal preferences vs similar user recommendations (0.0-1.0)',
    example: 0.5,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Personalized movie recommendations retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          releaseDate: { type: 'string', format: 'date' },
          genres: { type: 'array', items: { type: 'string' } },
          cast: { type: 'array', items: { type: 'string' } },
          posterUrl: { type: 'string' },
          rating: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters provided' })
  @ApiResponse({ status: 401, description: 'Unauthorized - must be logged in' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - profile does not belong to authenticated user',
  })
  async forUser(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Query('limit') limit?: string,
    @Query('contentWeight') contentWeight?: string,
  ) {
    const authenticatedUserId = req['user']?.sub;
    const recommendationLimit = limit ? parseInt(limit, 10) : 10;
    const collaborativeContentRatio = contentWeight
      ? parseFloat(contentWeight)
      : 0.5;

    const movies = await this.recommendationService.getRecommendationsForUser(
      authenticatedUserId,
      profileId,
      recommendationLimit,
      collaborativeContentRatio,
    );
    return movies;
  }

  /**
   * Get related movies for a specific movie
   *
   * Find movies that are similar to the specified movie based on what users
   * who liked this movie also enjoyed.
   *
   * @param movieId - The movie ID to find related movies for
   * @param limit - Number of related movies to return (default: 5, max: 20)
   */
  @Get('movie/:movieId')
  @ApiOperation({
    summary: 'Get related movies',
    description:
      'Find movies similar to the specified movie based on user viewing patterns and preferences.',
  })
  @ApiParam({
    name: 'movieId',
    description: 'The movie ID to find related movies for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of related movies to return (1-20)',
    example: 5,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Related movies retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          releaseDate: { type: 'string', format: 'date' },
          genres: { type: 'array', items: { type: 'string' } },
          cast: { type: 'array', items: { type: 'string' } },
          posterUrl: { type: 'string' },
          rating: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters provided' })
  @ApiResponse({ status: 404, description: 'Movie not found' })
  async related(
    @Param('movieId') movieId: string,
    @Query('limit') limit?: string,
  ) {
    const relatedLimit = limit ? parseInt(limit, 10) : 5;

    const movies = await this.recommendationService.getRelatedMovies(
      movieId,
      relatedLimit,
    );
    return movies;
  }

  /**
   * Admin endpoint to manually trigger similarity computation
   * Useful for development/testing or when cron job hasn't run yet
   */
  @Get('trigger-similarity-computation')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Manually trigger similarity computation (Admin only)',
    description:
      "Forces the collaborative filtering similarity computation to run immediately. Useful for development or when the cron job hasn't run yet.",
  })
  @ApiResponse({
    status: 200,
    description: 'Similarity computation completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        processedMovies: { type: 'number' },
        totalSimilarities: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async triggerSimilarityComputation() {
    const result =
      await this.recommendationService.triggerSimilarityComputation();
    return result;
  }

  /**
   * Admin endpoint to send personalized recommendation emails to all verified users.
   * Uses each user's last active session profile for generating recommendations.
   */
  @Post('send-recommendation-emails')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Send recommendation emails to users (Admin only)',
    description:
      'Generates personalized movie recommendations and sends them via email. Send to all verified users by omitting userIds, or target specific users by providing their IDs.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of movie recommendations per email (1-10)',
    example: 5,
    type: Number,
  })
  @HttpCode(202)
  @ApiResponse({
    status: 202,
    description: 'Recommendation email campaign accepted and processing',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            totalUsers: { type: 'number' },
            jobId: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async sendRecommendationEmails(
    @Query('limit') limit?: string,
    @Body() body?: SendRecommendationEmailsDto,
  ) {
    const movieLimit = limit ? parseInt(limit, 10) : 5;

    if (isNaN(movieLimit) || movieLimit < 1 || movieLimit > 10) {
      throw new BadRequestException('Limit must be between 1 and 10');
    }

    const result =
      await this.recommendationService.sendRecommendationEmails(
        movieLimit,
        body?.userIds,
      );

    return new StructuredResponse({
      message: 'Recommendation email campaign queued',
      data: result,
    });
  }

  /**
   * Admin endpoint to get paginated campaign history, optionally filtered by status.
   */
  @Get('email-campaign-history')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get email campaign history (Admin only)',
    description:
      'Returns a paginated list of all email campaign jobs, optionally filtered by status.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    example: 1,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (1-50, default: 10)',
    example: 10,
    type: Number,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by campaign status',
    enum: EmailCampaignStatus,
  })
  @ApiResponse({
    status: 200,
    description: 'Campaign history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'processing', 'completed', 'failed'],
              },
              movieLimit: { type: 'number' },
              totalUsers: { type: 'number' },
              emailsSent: { type: 'number' },
              emailsFailed: { type: 'number' },
              errorMessage: { type: 'string', nullable: true },
              dateCreated: { type: 'string', format: 'date-time' },
              startedAt: { type: 'string', format: 'date-time', nullable: true },
              completedAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
            },
          },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getEmailCampaignHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: EmailCampaignStatus,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Page must be a positive number');
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }
    if (
      status &&
      !Object.values(EmailCampaignStatus).includes(status)
    ) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${Object.values(EmailCampaignStatus).join(', ')}`,
      );
    }

    return this.recommendationService.getEmailCampaignHistory(
      pageNum,
      limitNum,
      status,
    );
  }

  /**
   * Admin endpoint to check the status of a recommendation email campaign job.
   */
  @Get('email-campaign-status/:jobId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Check email campaign job status (Admin only)',
    description:
      'Returns the current status of a recommendation email campaign job.',
  })
  @ApiParam({
    name: 'jobId',
    description: 'The campaign job ID returned from send-recommendation-emails',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Job status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed'],
        },
        movieLimit: { type: 'number' },
        totalUsers: { type: 'number' },
        emailsSent: { type: 'number' },
        emailsFailed: { type: 'number' },
        errorMessage: { type: 'string', nullable: true },
        dateCreated: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getEmailCampaignStatus(@Param('jobId') jobId: string) {
    return this.recommendationService.getEmailCampaignJobStatus(jobId);
  }
}
