import type { ProgressRepository } from '../ports/progress.repository';

export class GetProgressUseCase {
  constructor(private readonly progress: ProgressRepository) {}

  execute(userId: string): Promise<string[]> {
    return this.progress.listCompletedLessonIds(userId);
  }
}
