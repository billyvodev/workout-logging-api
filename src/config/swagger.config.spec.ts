import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { DEFAULT_GLOBAL_PREFIX, DEFAULT_API_VERSION } from '../common';
import {
  createSwaggerDocument,
  setupSwagger,
  swaggerCustomOptions,
} from './swagger.config';

describe('SwaggerConfig', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(DEFAULT_GLOBAL_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: DEFAULT_API_VERSION,
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('createSwaggerDocument', () => {
    it('should generate valid OpenAPI specification metadata', () => {
      const document = createSwaggerDocument(app);

      expect(document.openapi).toBe('3.0.0');
      expect(document.info.title).toBe('Everfit Workout Logging API');
      expect(document.info.version).toBe('1.0.0');
      expect(document.info.description).toContain(
        'High-performance REST API backend service for fitness coaches and clients',
      );
      expect(document.info.contact?.name).toBe('Everfit Engineering Team');
      expect(document.info.license?.name).toBe('MIT');

      const tagNames = document.tags?.map((t) => t.name);
      expect(tagNames).toContain('App');
      expect(tagNames).toContain('Health');
      expect(tagNames).toContain('Workouts');
      expect(tagNames).toContain('Personal Records');
      expect(tagNames).toContain('Exercises');
      expect(tagNames).toContain('Metadata');

      expect(document.components?.securitySchemes).toHaveProperty(
        'Idempotency-Key',
      );
      const securityScheme = document.components?.securitySchemes?.[
        'Idempotency-Key'
      ] as { type: string; in: string; name: string };
      expect(securityScheme.type).toBe('apiKey');
      expect(securityScheme.in).toBe('header');
      expect(securityScheme.name).toBe('Idempotency-Key');
    });

    it('should include paths from registered controllers', () => {
      const document = createSwaggerDocument(app);

      expect(document.paths).toHaveProperty('/api/v1');
      expect(document.paths['/api/v1']).toHaveProperty('get');
      expect(document.paths['/api/v1']?.get?.summary).toBe(
        'Health / Root greeting',
      );
    });
  });

  describe('setupSwagger', () => {
    it('should call SwaggerModule.setup and return the generated document', () => {
      const setupSpy = jest.spyOn(SwaggerModule, 'setup');

      const document = setupSwagger(app);

      expect(document).toBeDefined();
      expect(document.info.title).toBe('Everfit Workout Logging API');
      expect(setupSpy).toHaveBeenCalledWith(
        'docs',
        app,
        document,
        swaggerCustomOptions,
      );
      expect(setupSpy).toHaveBeenCalledWith(
        'api/docs',
        app,
        document,
        swaggerCustomOptions,
      );
      expect(setupSpy).toHaveBeenCalledWith(
        'api/v1/docs',
        app,
        document,
        swaggerCustomOptions,
      );

      setupSpy.mockRestore();
    });

    it('should respect custom SWAGGER_PATH environment variable', () => {
      const originalEnv = process.env.SWAGGER_PATH;
      process.env.SWAGGER_PATH = 'custom-docs';

      const setupSpy = jest.spyOn(SwaggerModule, 'setup');

      setupSwagger(app);

      expect(setupSpy).toHaveBeenCalledWith(
        'custom-docs',
        app,
        expect.anything(),
        swaggerCustomOptions,
      );

      setupSpy.mockRestore();
      if (originalEnv !== undefined) {
        process.env.SWAGGER_PATH = originalEnv;
      } else {
        delete process.env.SWAGGER_PATH;
      }
    });
  });
});
