import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { SubscriptionType } from './enum/userType';
import { CreateProfileDto } from './dto/create-user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: SignUpDto) {
    return this.userService.createUser(createUserDto);
  }

  @Post('profile')
  async createProfile(
    @Req() req: Request,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    return this.userService.createProfile(req['user'].id, createProfileDto);
  }

  @Post('subscribe')
  async placeUserOnSubscription(
    @Req() req: Request,
    subscriptionType: SubscriptionType,
  ) {
    const data = await this.userService.updateSubscriptionType(
      req['user'].id,
      subscriptionType,
    );
    return { data };
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(+id);
  }

  @Put('add-payment-method')
  async addPaymentMethod(
    @Body() addPaymentMethodDto: AddPaymentMethodDto,
    @Req() req: Request,
  ) {
    const data = await this.userService.addPaymentService(
      req['user'].sub,
      addPaymentMethodDto,
    );

    return { data, message: 'Payment method added successfully' };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
