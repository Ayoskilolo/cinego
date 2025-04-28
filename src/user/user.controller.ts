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
import { AuthGuard } from '../auth/auth.guard'; // Import AuthGuard
import { Request } from 'express'; // Import Request

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly myListService: MyListService,
  ) {}

  @Post()
  create(@Body() createUserDto: SignUpDto) {
    return this.userService.createUser(createUserDto);
  }

  @Patch('genres')
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
  async findUserProfiles(@Req() req: Request) {
    const data = await this.userService.getAllUserProfiles(req['user'].sub);
    return { data };
  }

  @Put('profiles/:profileId')
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
  async getMyList(@Req() req: Request) {
    const data = await this.myListService.getMyList(req['user'].sub);
    return { data };
  }

  @Post('my-list/:movieId')
  async addToMyList(@Req() req: Request, @Param('movieId') movieId: string) {
    const data = await this.myListService.addToMyList(req['user'].sub, movieId);
    return { data, message: 'Movie added to MyList' };
  }

  @Delete('my-list/:movieId')
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
  async getAccountDetails(@Req() req: Request) {
    const data = await this.userService.getAccountDetails(req['user'].sub);
    return { data, message: 'Account details retrieved successfully' };
  }

  @Put('account')
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
  async deleteAccount(@Req() req: Request) {
    const data = await this.userService.deleteAccount(req['user'].sub);
    return { data, message: 'Account deleted successfully' };
  }

  @Post('start-free-trial')
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
