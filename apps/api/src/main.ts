import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { DomainExceptionFilter } from './presentation/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(env.PORT);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
