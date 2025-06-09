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
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { UpdateReviewDto } from './dto/update-review.dto';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  createOrUpdate(
    @Body() createReviewDto: CreateReviewDto,
    @Req() req: Request,
  ) {
    return this.reviewService.upsert(createReviewDto, req['user']);
  }

  @Get('movie/:movieId')
  findAllByMovie(@Param('movieId') movieId: string, @Req() req: Request) {
    return this.reviewService.findAllReviewsByMovie(movieId, req['user']?.sub);
  }

  @Get('movie/:movieId/user')
  findByUserAndMovie(@Param('movieId') movieId: string, @Req() req: Request) {
    return this.reviewService.findOneReviewByUserAndMovie(
      req['user']?.sub,
      movieId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
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
  @Roles(Role.USER, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.reviewService.remove(id, req['user']?.sub);
  }
}
