import { Module } from '@nestjs/common';
import { ContentApiModule } from './presentation/content-api.module';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [ContentApiModule],
  controllers: [HealthController]
})
export class AppModule {}
