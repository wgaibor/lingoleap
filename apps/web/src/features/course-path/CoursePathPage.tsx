import { useParams } from 'react-router-dom';
import { computePathStatus, type CEFRLevel, type LearningLanguage } from '@lingoleap/core';
import { useCourse, useProgress } from './queries';
import { LessonNode } from './LessonNode';
import { summarizeCourseProgress } from './courseProgress';
import { StatsBar } from '../stats/StatsBar';

export function CoursePathPage() {
  const { language, level } = useParams<{ language: LearningLanguage; level: CEFRLevel }>();
  const courseQuery = useCourse(language as LearningLanguage, level as CEFRLevel);
  const progressQuery = useProgress();

  if (courseQuery.isPending || progressQuery.isPending) {
    return (
      <div className="container">
        <p>Cargando…</p>
      </div>
    );
  }

  if (courseQuery.isError || progressQuery.isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar el curso</p>
      </div>
    );
  }

  const course = courseQuery.data;
  const completedLessonIds = progressQuery.data;
  const status = computePathStatus(course, completedLessonIds);
  const units = [...course.units].sort((a, b) => a.position - b.position);
  const progress = summarizeCourseProgress(status);

  return (
    <div className="container">
      <StatsBar />
      <div className="course-path">
        <h2 className="course-path-title">{course.title}</h2>
        <div className="course-progress-header">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="course-progress-text">
            {progress.completed} de {progress.total} lecciones completadas · {progress.percent}%
          </p>
        </div>
        {units.map((unit) => (
          <section key={unit.id} className="course-path-unit">
            <h3 className="course-path-unit-title">{unit.title}</h3>
            <div className="lesson-path">
              {[...unit.lessons]
                .sort((a, b) => a.position - b.position)
                .map((lesson, index) => (
                  <LessonNode
                    key={lesson.id}
                    title={lesson.title}
                    status={status[lesson.id]}
                    lessonId={lesson.id}
                    language={course.language}
                    position={lesson.position}
                    showConnector={index > 0}
                    connectorActive={status[lesson.id] !== 'locked'}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
