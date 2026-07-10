import { Module } from '@nestjs/common';
import { IngestModule } from './infrastructure/ingest.module';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [IngestModule],
  controllers: [HealthController]
})
export class AppModule {}
