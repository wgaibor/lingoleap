import type {
  CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson, LessonRewards, StatsSummary
} from '@lingoleap/core';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
}

export class LingoApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const token = (await this.config.getAccessToken?.()) ?? null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${this.config.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      throw new ApiError(body?.code ?? 'UNKNOWN', body?.message ?? `Error HTTP ${response.status}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  listCourses(): Promise<CourseSummary[]> {
    return this.request('/courses');
  }

  getCourse(language: LearningLanguage, level: CEFRLevel): Promise<Course> {
    return this.request(`/courses/${language}/${level}`);
  }

  getLesson(lessonId: string): Promise<Lesson> {
    return this.request(`/lessons/${lessonId}`);
  }

  getStats(): Promise<StatsSummary> {
    return this.request('/me/stats');
  }

  async completeLesson(lessonId: string, options?: { errorCount?: number; date?: string }): Promise<LessonRewards> {
    const body = await this.request<{ completed: true; rewards: LessonRewards }>(
      `/progress/lessons/${lessonId}/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorCount: options?.errorCount ?? 0, date: options?.date ?? null })
      }
    );
    return body.rewards;
  }

  async getCompletedLessonIds(): Promise<string[]> {
    const body = await this.request<{ lessonIds: string[] }>('/progress/lessons');
    return body.lessonIds;
  }
}
