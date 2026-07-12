import { Link } from 'react-router-dom';
import type { LearningLanguage, LessonStatus } from '@lingoleap/core';

export interface LessonNodeProps {
  title: string;
  status: LessonStatus;
  lessonId: string;
  language: LearningLanguage;
  position: number;
  /** Muestra la línea conectora hacia la lección anterior (falso para la primera de la unidad). */
  showConnector?: boolean;
  /** Colorea la línea conectora en verde: el tramo lleva a una lección completada o desbloqueada. */
  connectorActive?: boolean;
}

export function LessonNode({
  title,
  status,
  lessonId,
  language,
  position,
  showConnector = false,
  connectorActive = false
}: LessonNodeProps) {
  const testId = 'lesson-' + lessonId;
  const connectorClass = showConnector
    ? ' lesson-node-with-connector' + (connectorActive ? ' lesson-node-connector-active' : '')
    : '';

  if (status === 'locked') {
    return (
      <div
        className={'lesson-node lesson-node-locked' + connectorClass}
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
      className={'lesson-node' + connectorClass}
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
