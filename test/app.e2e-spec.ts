import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DEFAULT_GLOBAL_PREFIX, DEFAULT_API_VERSION } from '../src/common';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(DEFAULT_GLOBAL_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: DEFAULT_API_VERSION,
    });
    await app.init();
  });

  it('/api/v1 (GET) should return Hello World and generate x-correlation-id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');

    expect(response.headers['x-correlation-id']).toBeDefined();
    expect(response.headers['x-correlation-id']).toMatch(/^req_[a-f0-9]{12}$/);
  });

  it('/api/v1 (GET) should preserve incoming x-correlation-id header', async () => {
    const customCorrelationId = 'req_custom_trace_999';
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .set('x-correlation-id', customCorrelationId)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(customCorrelationId);
  });

  it('/api/v1 (GET) should fallback to x-request-id header as correlation ID', async () => {
    const requestId = 'req_incoming_req_id';
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .set('x-request-id', requestId)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(requestId);
  });

  afterEach(async () => {
    await app.close();
  });
});
