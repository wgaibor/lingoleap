import {
  applyLessonDay, lessonXp, levelProgress, loseHearts, regenerateHearts, type LessonRewards
} from '@lingoleap/core';
import { LessonNotFoundError } from '../../domain/errors';
import { defaultUserStats } from '../../domain/user-stats';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import type { StatsRepository } from '../ports/stats.repository';

export interface CompleteLessonInput {
  userId: string;
  lessonId: string;
  errorCount: number;
  clientDate: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ERRORS = 50;

export class CompleteLessonUseCase {
  constructor(
    private readonly deps: {
      courses: CourseRepository;
      progress: ProgressRepository;
      stats: StatsRepository;
      now?: () => string;
    }
  ) {}

  async execute(input: CompleteLessonInput): Promise<LessonRewards> {
    const lesson = await this.deps.courses.findLessonById(input.lessonId);
    if (lesson === null) {
      throw new LessonNotFoundError(input.lessonId);
    }
    await this.deps.progress.markLessonCompleted(input.userId, input.lessonId);

    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const today =
      input.clientDate !== null && DATE_PATTERN.test(input.clientDate)
        ? input.clientDate
        : nowIso.slice(0, 10);
    const errorCount = Math.min(MAX_ERRORS, Math.max(0, Math.floor(input.errorCount)));

    const stored = (await this.deps.stats.findByUser(input.userId)) ?? defaultUserStats(input.userId, nowIso);
    const regen = regenerateHearts({ hearts: stored.hearts, updatedAt: stored.heartsUpdatedAt }, nowIso);
    const hearts = loseHearts(regen.hearts, errorCount);
    const xpEarned = lessonXp(errorCount);
    const totalXp = stored.xp + xpEarned;
    const streak = applyLessonDay(
      { count: stored.streakCount, lastDate: stored.lastLessonDate, freezes: stored.streakFreezes },
      today
    );

    await this.deps.stats.save({
      userId: input.userId,
      xp: totalXp,
      streakCount: streak.count,
      lastLessonDate: streak.lastDate,
      hearts,
      heartsUpdatedAt: regen.updatedAt,
      gems: stored.gems,
      streakFreezes: streak.freezes
    });

    return {
      xpEarned,
      totalXp,
      level: levelProgress(totalXp).level,
      streakCount: streak.count,
      freezeUsed: streak.freezeUsed,
      hearts
    };
  }
}
