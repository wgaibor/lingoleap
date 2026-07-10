import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestContentUseCase } from '../application/use-cases/ingest-content.use-case';
import { parseIngestArgs } from './parse-ingest-args';

async function main(): Promise<void> {
  const command = parseIngestArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn']
  });
  try {
    const useCase = app.get(IngestContentUseCase);
    const report = await useCase.execute(command);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
