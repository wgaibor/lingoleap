import type { Course, Exercise, Lesson } from '@lingoleap/core';

export interface CourseRow {
  id: string;
  language: string;
  level: string;
  title: string;
}
export interface UnitRow {
  id: string;
  course_id: string;
  title: string;
  position: number;
}
export interface LessonRow {
  id: string;
  unit_id: string;
  title: string;
  position: number;
}
export interface ExerciseRow {
  id: string;
  lesson_id: string;
  position: number;
  type: string;
  payload: unknown;
}
export interface ContentRows {
  course: CourseRow;
  units: UnitRow[];
  lessons: LessonRow[];
  exercises: ExerciseRow[];
}
export interface NestedLessonRow extends LessonRow {
  exercises: ExerciseRow[];
}
export interface NestedUnitRow extends UnitRow {
  lessons: NestedLessonRow[];
}
export interface CourseWithNestedRows extends CourseRow {
  units: NestedUnitRow[];
}

export function courseToRows(course: Course): ContentRows {
  const units: UnitRow[] = [];
  const lessons: LessonRow[] = [];
  const exercises: ExerciseRow[] = [];

  for (const unit of course.units) {
    units.push({ id: unit.id, course_id: course.id, title: unit.title, position: unit.position });
    for (const lesson of unit.lessons) {
      lessons.push({
        id: lesson.id,
        unit_id: unit.id,
        title: lesson.title,
        position: lesson.position
      });
      lesson.exercises.forEach((exercise, index) => {
        const { id, type, ...payload } = exercise;
        exercises.push({ id, lesson_id: lesson.id, position: index + 1, type, payload });
      });
    }
  }

  return {
    course: {
      id: course.id,
      language: course.language,
      level: course.level,
      title: course.title
    },
    units,
    lessons,
    exercises
  };
}

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

export function rowToLesson(row: NestedLessonRow): Lesson {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    exercises: [...row.exercises].sort(byPosition).map(
      (e) => ({ id: e.id, type: e.type, ...(e.payload as object) }) as Exercise
    )
  };
}

export function rowsToCourse(row: CourseWithNestedRows): Course {
  return {
    id: row.id,
    language: row.language as Course['language'],
    level: row.level as Course['level'],
    title: row.title,
    units: [...row.units].sort(byPosition).map((unit) => ({
      id: unit.id,
      title: unit.title,
      position: unit.position,
      lessons: [...unit.lessons].sort(byPosition).map(rowToLesson)
    }))
  };
}
