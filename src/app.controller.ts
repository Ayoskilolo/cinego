import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppService } from './app.service';
import { StructuredResponse } from './response/structured-response';
import { Public } from './auth/auth.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Service greeting' })
  @ApiResponse({ status: 200, description: 'Greeting message returned.' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api-docs-json')
  @Public()
  @ApiOperation({ summary: 'OpenAPI JSON document (when Swagger is enabled)' })
  @ApiResponse({ status: 200, description: 'OpenAPI JSON document.' })
  @ApiResponse({ status: 404, description: 'Swagger docs are disabled.' })
  getApiDocsJson() {
    const doc = this.appService.getSwaggerDocument();
    if (!doc) {
      throw new NotFoundException('Swagger docs are disabled');
    }
    return doc;
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check with dependency status' })
  @ApiResponse({
    status: 200,
    description: 'Service and all dependencies are healthy.',
  })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies are unavailable.',
  })
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const { healthy, payload } = await this.appService.getHealthStatus();
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return new StructuredResponse({
      status: healthy,
      message: healthy ? 'Service is healthy' : 'Service is degraded',
      data: payload,
    });
  }
}
