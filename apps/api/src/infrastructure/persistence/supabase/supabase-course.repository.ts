import type { SupabaseClient } from '@supabase/supabase-js';
import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../../../application/ports/course.repository';
import {
  courseToRows,
  rowsToCourse,
  rowToLesson,
  type CourseWithNestedRows,
  type NestedLessonRow
} from './course-row-mapper';

const NESTED_SELECT = 'id, language, level, title, units(id, course_id, title, position, lessons(id, unit_id, title, position, exercises(id, lesson_id, position, type, payload)))';

export class SupabaseCourseRepository implements CourseRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveCourse(course: Course): Promise<void> {
    const rows = courseToRows(course);

    // Reemplaza el curso existente (el cascade borra units/lessons/exercises)
    const del = await this.client
      .from('courses')
      .delete()
      .eq('language', course.language)
      .eq('level', course.level);
    if (del.error) {
      throw new Error(`Supabase delete falló: ${del.error.message}`);
    }

    const insCourse = await this.client.from('courses').insert(rows.course);
    if (insCourse.error) {
      throw new Error(`Supabase insert courses falló: ${insCourse.error.message}`);
    }
    const insUnits = await this.client.from('units').insert(rows.units);
    if (insUnits.error) {
      throw new Error(`Supabase insert units falló: ${insUnits.error.message}`);
    }
    const insLessons = await this.client.from('lessons').insert(rows.lessons);
    if (insLessons.error) {
      throw new Error(`Supabase insert lessons falló: ${insLessons.error.message}`);
    }
    const insExercises = await this.client.from('exercises').insert(rows.exercises);
    if (insExercises.error) {
      throw new Error(`Supabase insert exercises falló: ${insExercises.error.message}`);
    }
  }

  async findByLanguageAndLevel(
    language: LearningLanguage,
    level: CEFRLevel
  ): Promise<Course | null> {
    const { data, error } = await this.client
      .from('courses')
      .select(NESTED_SELECT)
      .eq('language', language)
      .eq('level', level)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase select course falló: ${error.message}`);
    }
    return data ? rowsToCourse(data as unknown as CourseWithNestedRows) : null;
  }

  async listSummaries(): Promise<CourseSummary[]> {
    const { data, error } = await this.client
      .from('courses')
      .select('id, language, level, title')
      .order('language')
      .order('level');
    if (error) {
      throw new Error(`Supabase list courses falló: ${error.message}`);
    }
    return (data ?? []) as CourseSummary[];
  }

  async findLessonById(lessonId: string): Promise<Lesson | null> {
    const { data, error } = await this.client
      .from('lessons')
      .select('id, unit_id, title, position, exercises(id, lesson_id, position, type, payload)')
      .eq('id', lessonId)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase select lesson falló: ${error.message}`);
    }
    return data ? rowToLesson(data as unknown as NestedLessonRow) : null;
  }
}
