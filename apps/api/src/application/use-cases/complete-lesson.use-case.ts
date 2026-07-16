import {
  applyLessonDay, divisionAfter, lessonXp, levelProgress, loseHearts, LEAGUE_COHORT_SIZE,
  regenerateHearts, unlockedAchievements, weekStartOf,
  type LessonRewards
} from '@lingoleap/core';
import { LessonNotFoundError } from '../../domain/errors';
import { defaultUserStats } from '../../domain/user-stats';
import type { AchievementsRepository } from '../ports/achievements.repository';
import type { CourseRepository } from '../ports/course.repository';
import type { LeagueRepository } from '../ports/league.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import type { StatsRepository } from '../ports/stats.repository';

export interface CompleteLessonInput {
  userId: string;
  userEmail: string;
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
      achievements: AchievementsRepository;
      league: LeagueRepository;
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
    const level = levelProgress(totalXp).level;

    const lessonsCompleted = (await this.deps.progress.listCompletedLessonIds(input.userId)).length;
    const alreadyUnlocked = await this.deps.achievements.listUnlockedIds(input.userId);
    const newlyUnlocked = unlockedAchievements(
      { streakCount: streak.count, lessonsCompleted, level },
      alreadyUnlocked
    );
    const gemsEarned = newlyUnlocked.reduce((sum, a) => sum + a.gems, 0);

    await this.deps.stats.save({
      userId: input.userId,
      xp: totalXp,
      streakCount: streak.count,
      lastLessonDate: streak.lastDate,
      hearts,
      heartsUpdatedAt: regen.updatedAt,
      gems: stored.gems + gemsEarned,
      streakFreezes: streak.freezes
    });

    for (const achievement of newlyUnlocked) {
      await this.deps.achievements.unlock(input.userId, achievement.id, nowIso);
    }

    const weekStart = weekStartOf(today);
    const active = await this.deps.league.findMembership(input.userId, weekStart);
    if (active) {
      await this.deps.league.saveMembership({
        ...active.membership,
        weeklyXp: active.membership.weeklyXp + xpEarned,
        lastXpAt: nowIso
      });
    } else {
      const latest = await this.deps.league.findLatestClosedMembership(input.userId);
      const division = latest
        ? divisionAfter(latest.cohort.division, latest.membership.result ?? 'stayed')
        : 'bronze';
      const cohort =
        (await this.deps.league.findOpenCohort(division, weekStart, LEAGUE_COHORT_SIZE)) ??
        (await this.deps.league.createCohort(division, weekStart));
      await this.deps.league.saveMembership({
        cohortId: cohort.id,
        userId: input.userId,
        displayName: input.userEmail.split('@')[0],
        weeklyXp: xpEarned,
        lastXpAt: nowIso,
        result: null
      });
    }

    return {
      xpEarned,
      totalXp,
      level,
      streakCount: streak.count,
      freezeUsed: streak.freezeUsed,
      hearts,
      gemsEarned,
      achievementsUnlocked: newlyUnlocked
    };
  }
}
