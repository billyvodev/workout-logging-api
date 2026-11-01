import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaServiceMock: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prismaServiceMock = {
      $queryRaw: jest.fn(),
    };
    controller = new HealthController(
      prismaServiceMock as unknown as PrismaService,
    );
  });

  it('should return status ok and database connected when DB ping succeeds', async () => {
    prismaServiceMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const result = await controller.checkHealth();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(typeof result.timestamp).toBe('string');
  });

  it('should throw ServiceUnavailableException when database query throws', async () => {
    prismaServiceMock.$queryRaw.mockRejectedValueOnce(
      new Error('Connection failure'),
    );

    await expect(controller.checkHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
