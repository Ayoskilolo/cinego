import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  Headers,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { Public } from 'src/auth/auth.decorator';
import { InitiateTransactionDto } from './dto/initiate-transaction.dto';
import { Request } from 'express';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // Generate reference and register transaction in db
  @Post('initiate')
  async initiate(
    @Body() initiateDto: InitiateTransactionDto,
    @Req() req: Request, // Inject the request object
  ) {
    // Extract userId from the 'sub' property of the JWT payload attached by the guard
    const userId = req['user']?.sub;

    if (!userId) {
      throw new UnauthorizedException(
        'User ID (sub) not found in authentication token.',
      );
    }

    const data = await this.transactionsService.initiateTransaction(
      initiateDto.amount,
      userId, // Pass the authenticated userId from token 'sub'
      initiateDto.paymentReason,
    );

    return { data };
  }

  @Get()
  async findAll(@Paginate() query: PaginateQuery) {
    const data = await this.transactionsService.findAll(query);
    return { data };
  }

  @Get('user/:userId')
  async findByUser(
    @Param('userId') userId: string,
    @Paginate() query: PaginateQuery,
  ) {
    const data = await this.transactionsService.findByUser(userId, query);
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.transactionsService.findOne(id);
    return { data };
  }

  @Post('cancel-subscription')
  async cancelSubscription(@Req() req: Request) {
    const userId = req['user']?.sub;

    const data = await this.transactionsService.cancelSubscription(userId);
    return { data };
  }

  // Flutterwave webhook
  @Public()
  @Post('webhook/flt')
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: any,
    @Headers('verif-hash') signature?: string,
  ) {
    // The service method now returns a string message or throws an error
    const message = await this.transactionsService.processFlutterWebhook(
      payload,
      signature,
    );
    // Return a simple success message or let Nest handle errors
    return { message };
  }

  // TODO: Add endpoint for checking how many subbed users there are.
}
