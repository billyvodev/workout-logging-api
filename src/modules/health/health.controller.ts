import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma';
import { BypassResponseTransform } from '../../common/decorators';

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  uptimeSeconds: number;
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
@BypassResponseTransform()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Health & readiness probe',
    description:
      'Performs operational health and database connectivity check for load balancers and container orchestrators.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is healthy and database is connected.',
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Service or database is degraded/disconnected.',
  })
  async checkHealth(): Promise<HealthResponse> {
    const uptimeSeconds =
      Math.round(((Date.now() - this.startTime) / 1000) * 10) / 10;
    const timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        uptimeSeconds,
        timestamp,
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        uptimeSeconds,
        timestamp,
      });
    }
  }
}
