import { Link } from 'react-router-dom';
import type { LearningLanguage, LessonStatus } from '@lingoleap/core';

export interface LessonNodeProps {
  title: string;
  status: LessonStatus;
  lessonId: string;
  language: LearningLanguage;
  position: number;
}

export function LessonNode({ title, status, lessonId, language, position }: LessonNodeProps) {
  const testId = 'lesson-' + lessonId;

  if (status === 'locked') {
    return (
      <div
        className="lesson-node lesson-node-locked"
        data-testid={testId}
        data-status={status}
        aria-disabled="true"
        title={title}
      >
        <span className="lesson-node-circle lesson-node-circle-locked" aria-hidden="true">
          🔒
        </span>
        <span className="lesson-node-label">{title}</span>
      </div>
    );
  }

  const isCompleted = status === 'completed';

  return (
    <Link
      to={'/lesson/' + lessonId + '?lang=' + language}
      className="lesson-node"
      data-testid={testId}
      data-status={status}
      title={title}
      aria-label={isCompleted ? title + ' (completada)' : undefined}
    >
      <span
        className={
          'lesson-node-circle ' +
          (isCompleted ? 'lesson-node-circle-completed' : 'lesson-node-circle-unlocked')
        }
        aria-hidden="true"
      >
        {isCompleted ? '✓' : position}
      </span>
      <span className="lesson-node-label">{title}</span>
    </Link>
  );
}
