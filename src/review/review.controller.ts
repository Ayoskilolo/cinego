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
} from '@nestjs/swagger';

@ApiTags('Reviews')
@ApiBearerAuth() // Apply BearerAuth to all routes in this controller
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(RolesGuard) // Assuming only authenticated users can create/update reviews
  @Roles(Role.USER, Role.ADMIN) // Or just Role.USER if admins don't review
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
  createOrUpdate(
    @Body() createReviewDto: CreateReviewDto,
    @Req() req: Request,
  ) {
    return this.reviewService.upsert(createReviewDto, req['user']);
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Get all reviews for a specific movie' })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved reviews.' })
  @ApiResponse({
    status: 404,
    description: 'Movie not found or no reviews yet.',
  })
  findAllByMovie(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Req() req: Request,
  ) {
    return this.reviewService.findAllReviewsByMovie(movieId, req['user']?.sub);
  }

  @Get('movie/:movieId/user')
  @UseGuards(RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: "Get the current user's review for a specific movie",
  })
  @ApiParam({ name: 'movieId', description: 'ID of the movie', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user review.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 404,
    description: 'Review not found for this user and movie.',
  })
  findByUserAndMovie(
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Req() req: Request,
  ) {
    return this.reviewService.findOneReviewByUserAndMovie(
      req['user']?.sub,
      movieId,
    );
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
    description: 'Forbidden (user does not own this review).',
  })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateReviewDto: UpdateReviewDto,
    @Req() req: Request,
  ) {
    return this.reviewService.update(
      id,
      updateReviewDto.rating,
      req['user']?.sub,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a review by its ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the review to delete',
    type: 'string',
  })
  @ApiResponse({ status: 204, description: 'Review deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (user does not own this review or not an admin).',
  })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.reviewService.remove(id, req['user']?.sub);
  }
}
