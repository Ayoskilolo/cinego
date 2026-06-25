import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface HealthStatus {
  healthy: boolean;
  payload: {
    status: 'ok' | 'error';
    uptime: number;
    timestamp: string;
    environment: string;
    version: string;
    checks: {
      database: DependencyCheck;
    };
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private swaggerDocument: any;

  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  setSwaggerDocument(doc: any) {
    this.swaggerDocument = doc;
  }

  getSwaggerDocument() {
    return this.swaggerDocument;
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const database = await this.checkDatabase();
    const healthy = database.status === 'up';

    return {
      healthy,
      payload: {
        status: healthy ? 'ok' : 'error',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? 'unknown',
        version: process.env.npm_package_version ?? '0.0.1',
        checks: { database },
      },
    };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      if (!this.dataSource?.isInitialized) {
        return { status: 'down', error: 'DataSource is not initialized' };
      }
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error('Health check database query failed', error?.stack);
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error?.message ?? 'Unknown database error',
      };
    }
  }
}
