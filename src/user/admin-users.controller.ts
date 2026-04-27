import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { SignUpDto } from '../auth/dto/sign-up.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { SubscriptionType } from './enum/userType';
import { StructuredResponse } from '../response/structured-response';

// Admin-only DTOs (scoped to this controller to avoid extra files)
class AdminCreateUserDto extends SignUpDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

class AdminUpdateUserDto extends UpdateAccountDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  // Verification flag
  @ApiPropertyOptional({ description: 'Email verification status' })
  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean;

  // Subscription fields
  @ApiPropertyOptional({ enum: SubscriptionType, description: 'User subscription type' })
  @IsOptional()
  @IsEnum(SubscriptionType)
  subscriptionType?: SubscriptionType;

  @ApiPropertyOptional({ description: 'Indicates if user currently has an active subscription' })
  @IsOptional()
  @IsBoolean()
  isSubscribed?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Subscription expiry date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  subscriptionExpiresAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Next billing date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @ApiPropertyOptional({ description: 'Whether user has used free trial' })
  @IsOptional()
  @IsBoolean()
  hasUsedFreeTrial?: boolean;
}

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of users (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by column:direction (e.g., dateCreated:DESC)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term (firstName, lastName, email, phoneNumber)' })
  @ApiQuery({ name: 'filter', required: false, type: String, description: 'Filter by column:value (e.g., role:$eq:ADMIN)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved users.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Paginate() query: PaginateQuery) {
    const result = await this.userService.findAllPaginated(query);
    // Preserve pagination metadata by wrapping inside the data object
    return new StructuredResponse({ data: { items: result.data, meta: result.meta, links: result.links } });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiBody({ type: AdminCreateUserDto })
  @ApiResponse({ status: 201, description: 'User created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() dto: AdminCreateUserDto) {
    const user = await this.userService.createUser(dto);
    // If admin supplied role, apply it post-creation
    if (dto.role !== undefined) {
      await this.userService.updateUser(user.id, {
        role: dto.role ?? user.role,
      });
    }
    // Return the fresh user state
    const updated = await this.userService.findOneByIdForAdmin(user.id);
    return new StructuredResponse({ message: 'User created successfully', data: updated });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved user.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.userService.findOneByIdForAdmin(id);
    return new StructuredResponse({ data });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiBody({ type: AdminUpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateUserDto) {
    const {
      role,
      isEmailVerified,
      subscriptionType,
      isSubscribed,
      subscriptionExpiresAt,
      nextBillingDate,
      hasUsedFreeTrial,
      ...accountFields
    } = dto;

    // Handle password hashing and account fields using existing service method
    if (Object.keys(accountFields).length > 0) {
      await this.userService.updateAccountDetails(id, accountFields as UpdateAccountDto);
    }

    // Apply admin-specific fields
    const adminUpdates: any = {
      ...(role !== undefined ? { role } : {}),
      ...(isEmailVerified !== undefined ? { isEmailVerified } : {}),
      ...(subscriptionType !== undefined ? { subscriptionType } : {}),
      ...(isSubscribed !== undefined ? { isSubscribed } : {}),
      ...(subscriptionExpiresAt !== undefined ? { subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null } : {}),
      ...(nextBillingDate !== undefined ? { nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : null } : {}),
      ...(hasUsedFreeTrial !== undefined ? { hasUsedFreeTrial } : {}),
    };

    if (Object.keys(adminUpdates).length > 0) {
      await this.userService.updateUser(id, adminUpdates);
    }

    const data = await this.userService.findOneByIdForAdmin(id);
    return new StructuredResponse({ message: 'User updated successfully', data });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'User deleted successfully.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.userService.deleteAccount(id);
  }
}