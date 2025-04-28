import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  Headers,
  UseGuards, // Import UseGuards
  Req,
  UnauthorizedException, // Import Req
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
// Remove CreateTransactionDto and UpdateTransactionDto if not used elsewhere
// import { CreateTransactionDto } from './dto/create-transaction.dto';
// import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { Public } from 'src/auth/auth.decorator';
import { InitiateTransactionDto } from './dto/initiate-transaction.dto';
import { AuthGuard } from 'src/auth/auth.guard'; // Import your Auth Guard
import { Request } from 'express'; // Import Request type

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // Generate reference and register transaction in db
  @Post('initiate')
  @UseGuards(AuthGuard)
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

  // TODO: Add endpoint for cancelling a subscription and for checking how many subbed users there are.
}
