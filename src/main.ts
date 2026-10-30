import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { DEFAULT_GLOBAL_PREFIX, DEFAULT_API_VERSION } from './common';
import { setupSwagger } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix(DEFAULT_GLOBAL_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });

  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
