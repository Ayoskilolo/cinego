import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Admin Transactions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/transactions')
export class AdminTransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get a paginated list of transactions (Admin only)',
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
    description: 'Sort by column:direction (e.g., dateCreated:DESC)',
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
    description: 'Filter by column:value (e.g., paymentReason:$eq:premium)',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved transactions.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Paginate() query: PaginateQuery) {
    const result = await this.transactionsService.findAll(query);
    return {
      data: { items: result.data, meta: result.meta, links: result.links },
    };
  }

  // Moved above ':id' to avoid route conflict
  @Get('stats')
  @ApiOperation({
    summary: 'Get aggregated transaction stats for charts (Admin only)',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'ISO 8601 start datetime (UTC recommended)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'ISO 8601 end datetime (UTC recommended)',
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    type: String,
    description: 'Aggregation interval: day|week|month',
    example: 'day',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description:
      'Optional status filter (e.g., SUCCESS or SUCCESSFUL|PENDING|FAILED|ERROR)',
  })
  @ApiQuery({
    name: 'timezone',
    required: false,
    type: String,
    description: 'Timezone (currently UTC only, reserved for future).',
    example: 'UTC',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated series by interval with zero-filled buckets.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async stats(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') interval?: 'day' | 'week' | 'month',
    @Query('status') status?: string,
    @Query('timezone') timezone?: string,
  ) {
    const res = await this.transactionsService.getAggregatedStats({
      from,
      to,
      interval,
      status,
      timezone,
    });
    return { data: res };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Transaction ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved transaction.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    // Service already returns { data: transaction }, so return as-is to avoid double wrapping
    return await this.transactionsService.findOne(id);
  }
}
