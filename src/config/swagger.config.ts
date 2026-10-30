import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerCustomOptions,
  SwaggerModule,
  OpenAPIObject,
} from '@nestjs/swagger';

/**
 * Builds the OpenAPI 3.0 document specification for the Everfit Workout Logging API.
 */
export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Everfit Workout Logging API')
    .setDescription(
      `## Overview
High-performance REST API backend service for fitness coaches and clients to log workout sets, inspect workout history using keyset cursor pagination, and analyze Personal Records (PRs) across arbitrary time windows.`,
    )
    .setVersion('1.0.0')
    .setContact(
      'Everfit Engineering Team',
      'https://everfit.io',
      'support@everfit.io',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addTag(
      'App',
      'General application and root endpoints for service connectivity checks',
    )
    .addTag(
      'Health',
      'Operational health and readiness probes for load balancers and container orchestrators',
    )
    .addTag(
      'Workouts',
      'Workout entry logging (single & bulk) and chronological keyset paginated history',
    )
    .addTag(
      'Personal Records',
      'Personal records (PRs) calculation and period-over-period performance comparisons',
    )
    .addTag(
      'Exercises',
      'Exercise catalog, canonical alias matching, and muscle group classifications',
    )
    .addTag(
      'Metadata',
      'System configuration metadata, active weight unit registries, and conversion factors',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Idempotency-Key',
        in: 'header',
        description:
          'Optional unique UUID v4 string to safely retry workout logging requests without duplicating records.',
      },
      'Idempotency-Key',
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

export const swaggerCustomOptions: SwaggerCustomOptions = {
  customSiteTitle: 'Everfit Workout Logging API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
};

/**
 * Initializes and registers Swagger UI and JSON/YAML specifications on the NestJS application.
 *
 * Exposes:
 * - \`/docs\` (Swagger UI)
 * - \`/docs-json\` (OpenAPI JSON specification)
 * - \`/docs-yaml\` (OpenAPI YAML specification)
 * - \`/api/docs\` (Alternative Swagger UI alias)
 */
export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = createSwaggerDocument(app);

  const primaryPath = process.env.SWAGGER_PATH || 'docs';
  SwaggerModule.setup(primaryPath, app, document, swaggerCustomOptions);

  // Also register on 'api/docs' and 'api/v1/docs' for developer convenience
  if (primaryPath !== 'api/docs') {
    SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);
  }
  if (primaryPath !== 'api/v1/docs') {
    SwaggerModule.setup('api/v1/docs', app, document, swaggerCustomOptions);
  }

  return document;
}
