import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DEFAULT_GLOBAL_PREFIX, DEFAULT_API_VERSION } from '../src/common';
import { setupSwagger } from '../src/config';

describe('Swagger Documentation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(DEFAULT_GLOBAL_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: DEFAULT_API_VERSION,
    });
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/docs (GET) should serve the Swagger UI HTML page', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/')
      .expect(200);

    expect(response.text).toContain(
      'Everfit Workout Logging API Documentation',
    );
    expect(response.text).toContain('id="swagger-ui"');
  });

  it('/api/docs (GET) should serve the Swagger UI HTML page on alias route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs/')
      .expect(200);

    expect(response.text).toContain(
      'Everfit Workout Logging API Documentation',
    );
    expect(response.text).toContain('id="swagger-ui"');
  });

  it('/api/v1/docs (GET) should serve the Swagger UI HTML page under the default route prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/docs/')
      .expect(200);

    expect(response.text).toContain(
      'Everfit Workout Logging API Documentation',
    );
    expect(response.text).toContain('id="swagger-ui"');
  });

  it('/docs-json (GET) should return valid OpenAPI 3.0 JSON specification', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);

    const spec = response.body as unknown as OpenAPIObject;
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('Everfit Workout Logging API');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.paths).toBeDefined();
    expect(spec.paths['/api/v1']).toBeDefined();
    expect(spec.components?.schemas).toBeDefined();
    expect(spec.components?.securitySchemes?.['Idempotency-Key']).toBeDefined();
  });
});
