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

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: SignUpDto) {
    return this.userService.create(createUserDto);
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
