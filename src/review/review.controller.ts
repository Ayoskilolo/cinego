import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { UpdateReviewDto } from './dto/update-review.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Reviews')
@ApiBearerAuth() // Apply BearerAuth to all routes in this controller
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update a review for a movie' })
  @ApiBody({ type: CreateReviewDto })
  @ApiResponse({
    status: 200,
    description: 'Review created/updated successfully.',
  })
  @ApiResponse({
    status: 201,
    description: 'Review created/updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  async createOrUpdate(
    @Body() createReviewDto: CreateReviewDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return await this.reviewService.upsert(
      createReviewDto,
      user.profileId,
      req['user'],
    );
  }

  @Get('movie/:movieId/summary')
  @ApiOperation({
    summary:
      'Get movie rating summary (average rating, total reviews, distribution)',
  })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved movie rating summary.',
    schema: {
      type: 'object',
      properties: {
        averageRating: { type: 'number', example: 4.2 },
        totalReviews: { type: 'number', example: 150 },
        ratingDistribution: {
          type: 'object',
          properties: {
            '1': { type: 'number', example: 5 },
            '2': { type: 'number', example: 10 },
            '3': { type: 'number', example: 25 },
            '4': { type: 'number', example: 60 },
            '5': { type: 'number', example: 50 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Movie not found.',
  })
  async getMovieRatingSummary(
    @Param('movieId', ParseUUIDPipe) movieId: string,
  ) {
    return await this.reviewService.getMovieRatingSummary(movieId);
  }

  @Get('movie/:movieId')
  @ApiOperation({
    summary: 'Get paginated individual reviews for a specific movie',
  })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Sort by column:direction (e.g., dateCreated:DESC)',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description: 'Filter by rating (e.g., rating:$eq:5)',
  })
  @ApiResponse({ status: 200, description: 'Successfully retrieved reviews.' })
  @ApiResponse({
    status: 404,
    description: 'Movie not found.',
  })
  async getMovieReviews(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Paginate() query: PaginateQuery,
  ) {
    return await this.reviewService.getMovieReviews(query, movieId);
  }

  @Get('movie/:movieId/profile')
  @UseGuards(RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: "Get the current profile's review for a specific movie",
  })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved profile review.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 404,
    description: 'Review not found for this profile and movie.',
  })
  async findByProfileAndMovie(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Req() req: Request,
  ) {
    const user = req['user'];
    const data = await this.reviewService.findOneReviewByProfileAndMovie(
      user.profileId,
      movieId,
    );
    console.log(data);
    return { data };
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Update an existing review by its ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the review to update',
    type: 'string',
  })
  @ApiBody({ type: UpdateReviewDto })
  @ApiResponse({ status: 200, description: 'Review updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (profile does not own this review).',
  })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateReviewDto: UpdateReviewDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return await this.reviewService.update(id, updateReviewDto, user.profileId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a review by its ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the review to delete',
    type: 'string',
  })
  @ApiResponse({ status: 200, description: 'Review deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden (profile does not own this review or not an admin).',
  })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = req['user'];
    return await this.reviewService.remove(id, user.profileId);
  }
}
