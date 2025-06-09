import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Req,
  Patch,
  UseGuards, // Added UseGuards
  HttpCode, // Added HttpCode
  HttpStatus,
  UnauthorizedException, // Added HttpStatus
} from '@nestjs/common';
import { UserService } from './user.service';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { SubscriptionType } from './enum/userType';
import { CreateProfileDto } from './dto/create-user.dto';
import { Genres } from '../movie/genres.enum';
import { MyListService } from '../my-list/my-list.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateWatchHistoryDto } from './dto/update-watch-history.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger'; // Added

@ApiTags('User') // Added
@ApiBearerAuth() // Added - Assuming most user endpoints require auth
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly myListService: MyListService,
  ) {}

  @Patch('genres')
  @ApiOperation({ summary: 'Update user preferred genres' })
  @ApiResponse({
    status: 200,
    description: 'User genres updated successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        genres: {
          type: 'array',
          items: { type: 'string', enum: Object.values(Genres) },
        },
      },
    },
  })
  async updateUserGenres(
    @Req() req: Request,
    @Body('genres') genres: Genres[],
  ) {
    const data = await this.userService.updateUserGenres(
      req['user'].sub,
      genres,
    );
    return { data };
  }

  // TODO: Make this an admin endpoint just so that the admin can grant premium to a user
  // @Post('subscribe')
  // async placeUserOnSubscription(
  //   @Req() req: Request,
  //   subscriptionType: SubscriptionType,
  // ) {
  //   const data = await this.userService.updateSubscriptionType(
  //     req['user'].id,
  //     subscriptionType,
  //   );
  //   return { data };
  // }

  @Post('profiles')
  @ApiOperation({ summary: 'Create a new profile for the user' })
  @ApiResponse({ status: 201, description: 'Profile created successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async createProfile(
    @Req() req: Request,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    const data = await this.userService.createProfile(
      req['user'].sub,
      createProfileDto,
    );
    return { data, message: 'Profile created successfully' };
  }

  @Get('profiles')
  @ApiOperation({ summary: 'Get all profiles for the user' })
  @ApiResponse({ status: 200, description: 'Profiles retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async findUserProfiles(@Req() req: Request) {
    const data = await this.userService.getAllUserProfiles(req['user'].sub);
    return { data };
  }

  @Put('profiles/:profileId')
  @ApiOperation({ summary: 'Update a specific user profile' })
  @ApiParam({
    name: 'profileId',
    description: 'The ID of the profile to update',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async updateProfile(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const data = await this.userService.updateProfile(
      req['user'].sub,
      profileId,
      updateProfileDto,
    );
    return { data };
  }

  @Delete('profiles/:profileId')
  @ApiOperation({ summary: 'Delete a specific user profile' })
  @ApiParam({
    name: 'profileId',
    description: 'The ID of the profile to delete',
  })
  @ApiResponse({ status: 200, description: 'Profile deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async deleteProfile(
    @Req() req: Request,
    @Param('profileId') profileId: string,
  ) {
    const data = await this.userService.deleteProfile(
      req['user'].sub,
      profileId,
    );
    return { data };
  }

  @Post('profiles/:profileId/switch')
  @ApiOperation({ summary: 'Switch to a different user profile' })
  @ApiParam({
    name: 'profileId',
    description: 'The ID of the profile to switch to',
  })
  @ApiResponse({ status: 200, description: 'Profile switched successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async switchProfile(
    @Req() req: Request,
    @Param('profileId') profileId: string,
  ) {
    const { profile, accessToken } = await this.userService.switchProfile(
      req['user'].sub,
      profileId,
    );
    return {
      data: profile,
      accessToken,
      message: 'Profile switched successfully',
    };
  }

  @Get('my-list')
  @ApiOperation({ summary: "Get the user's movie list" })
  @ApiResponse({ status: 200, description: 'MyList retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyList(@Req() req: Request) {
    const data = await this.myListService.getMyList(req['user'].sub);
    return { data };
  }

  @Post('my-list/:movieId')
  @ApiOperation({ summary: "Add a movie to the user's list" })
  @ApiParam({ name: 'movieId', description: 'The ID of the movie to add' })
  @ApiResponse({
    status: 201,
    description: 'Movie added to MyList successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Movie not found.' })
  async addToMyList(@Req() req: Request, @Param('movieId') movieId: string) {
    const data = await this.myListService.addToMyList(req['user'].sub, movieId);
    return { data, message: 'Movie added to MyList' };
  }

  @Delete('my-list/:movieId')
  @ApiOperation({ summary: "Remove a movie from the user's list" })
  @ApiParam({ name: 'movieId', description: 'The ID of the movie to remove' })
  @ApiResponse({
    status: 200,
    description: 'Movie removed from MyList successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Movie not found in list.' })
  async removeFromMyList(
    @Req() req: Request,
    @Param('movieId') movieId: string,
  ) {
    const data = await this.myListService.removeFromMyList(
      req['user'].sub,
      movieId,
    );
    return { data, message: 'Movie removed from MyList' };
  }

  // @Get()
  // findAll() {
  //   return this.userService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.userService.findOne(id);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.userService.remove(id);
  // }

  @Post('profiles/:profileId/watch-history')
  @ApiOperation({ summary: 'Update watch history for a profile' })
  @ApiParam({ name: 'profileId', description: 'The ID of the profile' })
  @ApiResponse({
    status: 201,
    description: 'Watch history updated successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async updateWatchHistory(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Body() updateWatchHistoryDto: UpdateWatchHistoryDto,
  ) {
    const watchHistory = await this.userService.updateWatchHistory(
      req['user'].sub,
      profileId,
      updateWatchHistoryDto,
    );
    return {
      data: watchHistory,
      message: 'Watch history updated successfully',
    };
  }

  @Get('profiles/:profileId/watch-history')
  @ApiOperation({ summary: 'Get watch history for a profile' })
  @ApiParam({ name: 'profileId', description: 'The ID of the profile' })
  @ApiResponse({
    status: 200,
    description: 'Watch history retrieved successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async getWatchHistory(
    @Req() req: Request,
    @Param('profileId') profileId: string,
  ) {
    const watchHistory = await this.userService.getWatchHistory(
      req['user'].sub,
      profileId,
    );
    return {
      data: watchHistory,
      message: 'Watch history retrieved successfully',
    };
  }

  @Delete('profiles/:profileId/watch-history')
  @ApiOperation({ summary: 'Clear watch history for a profile' })
  @ApiParam({ name: 'profileId', description: 'The ID of the profile' })
  @ApiResponse({
    status: 200,
    description: 'Watch history cleared successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async clearWatchHistory(
    @Req() req: Request,
    @Param('profileId') profileId: string,
  ) {
    const result = await this.userService.clearWatchHistory(
      req['user'].sub,
      profileId,
    );
    return {
      data: result,
      message: 'Watch history cleared successfully',
    };
  }

  @Delete('profiles/:profileId/watch-history/:movieId')
  @ApiOperation({ summary: 'Delete a specific movie from watch history' })
  @ApiParam({ name: 'profileId', description: 'The ID of the profile' })
  @ApiParam({
    name: 'movieId',
    description: 'The ID of the movie to remove from history',
  })
  @ApiResponse({
    status: 200,
    description: 'Watch history entry deleted successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile or movie not found.' })
  async deleteWatchHistoryEntry(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Param('movieId') movieId: string,
  ) {
    const result = await this.userService.deleteWatchHistoryEntry(
      req['user'].sub,
      profileId,
      movieId,
    );
    return {
      data: result,
      message: 'Watch history entry deleted successfully',
    };
  }

  @Post('profiles/:profileId/validate-pin')
  @ApiOperation({ summary: 'Validate a profile PIN' })
  @ApiParam({ name: 'profileId', description: 'The ID of the profile' })
  @ApiBody({
    schema: { type: 'object', properties: { pin: { type: 'string' } } },
  })
  @ApiResponse({ status: 201, description: 'PIN validated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid PIN.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async validateProfilePin(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Body('pin') pin: string,
  ) {
    const isValid = await this.userService.validateProfilePin(
      req['user'].sub,
      profileId,
      pin,
    );
    return {
      data: isValid,
      message: 'PIN validated successfully',
    };
  }

  @Get('account')
  @ApiOperation({ summary: 'Get user account details' })
  @ApiResponse({
    status: 200,
    description: 'Account details retrieved successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getAccountDetails(@Req() req: Request) {
    const data = await this.userService.getAccountDetails(req['user'].sub);
    return { data, message: 'Account details retrieved successfully' };
  }

  @Put('account')
  @ApiOperation({ summary: 'Update user account details' })
  @ApiResponse({
    status: 200,
    description: 'Account details updated successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateAccountDetails(
    @Req() req: Request,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    const data = await this.userService.updateAccountDetails(
      req['user'].sub,
      updateAccountDto,
    );
    return { data, message: 'Account details updated successfully' };
  }

  @Delete('account')
  @ApiOperation({ summary: 'Delete user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async deleteAccount(@Req() req: Request) {
    const data = await this.userService.deleteAccount(req['user'].sub);
    return { data, message: 'Account deleted successfully' };
  }

  @Post('start-free-trial')
  @ApiOperation({ summary: 'Start a free trial for the user' })
  @ApiResponse({ status: 200, description: 'Free trial started successfully.' })
  @ApiResponse({ status: 401, description: 'User not authenticated.' })
  @ApiResponse({
    status: 400,
    description: 'User has already had a free trial or is subscribed.',
  })
  @HttpCode(HttpStatus.OK)
  async startFreeTrial(@Req() req: Request) {
    const userId = req['user']?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated.');
    }
    const updatedUser = await this.userService.startFreeTrial(userId);
    return { data: updatedUser, message: 'Free trial started successfully.' };
  }
}
