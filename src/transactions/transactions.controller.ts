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
  ParseUUIDPipe,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { Public } from 'src/auth/auth.decorator';
import { InitiateTransactionDto } from './dto/initiate-transaction.dto';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiHeader,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('initiate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initiate a new transaction (e.g., for subscription)',
  })
  @ApiBody({ type: InitiateTransactionDto })
  @ApiResponse({
    status: 201,
    description:
      'Transaction initiated successfully, returns payment link or reference.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., invalid amount or payment reason).',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized (User not authenticated).',
  })
  async initiate(
    @Body() initiateDto: InitiateTransactionDto,
    @Req() req: Request, // Inject the request object
  ) {
    const userId = req['user']?.sub;
    if (!userId) {
      throw new UnauthorizedException(
        'User ID (sub) not found in authentication token.',
      );
    }
    const data = await this.transactionsService.initiateTransaction(
      initiateDto.amount,
      userId,
      initiateDto.paymentReason,
    );
    return { data };
  }

  @Get()
  @ApiBearerAuth() // Assuming this should be protected, add if admin/specific user role
  @ApiOperation({
    summary: 'Get a paginated list of all transactions (Admin access implied)',
  })
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
    description: 'Sort by column:direction (e.g., createdAt:DESC)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for relevant fields',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description: 'Filter by column:value (e.g., status:SUCCESS)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved transactions.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async findAll(@Paginate() query: PaginateQuery) {
    const data = await this.transactionsService.findAll(query);
    return { data };
  }

  @Get('user/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a paginated list of transactions for a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user whose transactions to retrieve',
    type: 'string',
  })
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
    description: 'Sort by column:direction',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description: 'Filter by column:value',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user transactions.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden (User can only access their own transactions unless admin).',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Paginate() query: PaginateQuery,
  ) {
    // Add logic here to check if req['user'].sub === userId or if user is admin
    const data = await this.transactionsService.findByUser(userId, query);
    return { data };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific transaction by its ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the transaction',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved transaction.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (User does not own this transaction unless admin).',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    // Add logic here to check if user owns transaction or is admin
    const data = await this.transactionsService.findOne(id);
    return { data };
  }

  @Post('cancel-subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cancel the current user's active subscription" })
  @ApiResponse({
    status: 200,
    description: 'Subscription cancellation processed successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized (User not authenticated).',
  })
  @ApiResponse({
    status: 404,
    description: 'No active subscription found for the user or user not found.',
  })
  async cancelSubscription(@Req() req: Request) {
    const userId = req['user']?.sub;
    if (!userId) {
      throw new UnauthorizedException(
        'User ID (sub) not found in authentication token.',
      );
    }
    const data = await this.transactionsService.cancelSubscription(userId);
    return { data };
  }

  @Public()
  @Post('webhook/flt')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Flutterwave webhook endpoint for payment notifications',
  })
  @ApiHeader({
    name: 'verif-hash',
    description: 'Flutterwave verification hash for webhook security',
    required: false,
  })
  @ApiBody({ description: 'Webhook payload from Flutterwave', type: Object }) // Type can be more specific if payload structure is known
  @ApiResponse({
    status: 200,
    description: 'Webhook received and processed successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., missing signature or invalid payload).',
  })
  async handleWebhook(
    @Body() payload: any,
    @Headers('verif-hash') signature?: string,
  ) {
    const message = await this.transactionsService.processFlutterWebhook(
      payload,
      signature,
    );
    return { message };
  }
}
