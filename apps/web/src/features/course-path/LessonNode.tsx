import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { LearningLanguage, LessonStatus } from '@lingoleap/core';

export interface LessonNodeProps {
  title: string;
  status: LessonStatus;
  lessonId: string;
  language: LearningLanguage;
}

const bubbleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: 'var(--radius-pill)',
  fontWeight: 700,
  textAlign: 'center'
};

export function LessonNode({ title, status, lessonId, language }: LessonNodeProps) {
  const testId = 'lesson-' + lessonId;

  if (status === 'locked') {
    return (
      <div
        data-testid={testId}
        data-status={status}
        aria-disabled="true"
        title={title}
        style={{
          ...bubbleStyle,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          cursor: 'not-allowed'
        }}
      >
        {title}
      </div>
    );
  }

  const isCompleted = status === 'completed';

  return (
    <Link
      to={'/lesson/' + lessonId + '?lang=' + language}
      data-testid={testId}
      data-status={status}
      title={title}
      aria-label={isCompleted ? title + ' (completada)' : title}
      style={{
        ...bubbleStyle,
        background: 'var(--color-primary)',
        opacity: isCompleted ? 1 : 0.85,
        color: 'var(--color-surface)',
        textDecoration: 'none'
      }}
    >
      {isCompleted ? '✓' : title}
    </Link>
  );
}
