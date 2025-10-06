import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

class AdminCreateProviderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/)
  slug: string;

  @IsUrl()
  @IsNotEmpty()
  baseUrl: string;

  @IsBoolean()
  isActive: boolean;
}

class AdminUpdateProviderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Admin Providers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'Get a paginated list of providers (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'filter', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Successfully retrieved providers.' })
  async list(@Paginate() query: PaginateQuery) {
    const result = await this.providersService.adminFindAllPaginated(query);
    return { data: { items: result.data, meta: result.meta, links: result.links } };
  }

  @Post()
  @ApiOperation({ summary: 'Create a provider (Admin only)' })
  @ApiBody({ type: AdminCreateProviderDto })
  @ApiResponse({ status: 201, description: 'Provider created successfully.' })
  async create(@Body() dto: AdminCreateProviderDto) {
    const data = await this.providersService.adminCreate(dto);
    return { message: 'Provider created successfully', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a provider by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Provider ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved provider.' })
  @ApiResponse({ status: 404, description: 'Provider not found.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.providersService.adminFindOne(id);
    return { data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a provider (Admin only)' })
  @ApiParam({ name: 'id', description: 'Provider ID', type: 'string' })
  @ApiBody({ type: AdminUpdateProviderDto })
  @ApiResponse({ status: 200, description: 'Provider updated successfully.' })
  @ApiResponse({ status: 404, description: 'Provider not found.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateProviderDto) {
    const data = await this.providersService.adminUpdate(id, dto);
    return { message: 'Provider updated successfully', data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a provider (Admin only)' })
  @ApiParam({ name: 'id', description: 'Provider ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Provider deleted successfully.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.providersService.adminDelete(id);
  }
}