import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
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
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  getHealth() {
    return { status: 'ok' };
  }
}
