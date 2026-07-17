import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computePathStatus, type CEFRLevel, type LearningLanguage } from '@lingoleap/core';
import { theme } from '../../app/theme';
import { StatsBar } from '../stats/StatsBar';
import { useCourse, useProgress } from './queries';

const STATUS_EMOJI = { completed: '✅', unlocked: '⭐', locked: '🔒' } as const;

export function CoursePathScreen() {
  const router = useRouter();
  const { language, level } = useLocalSearchParams<{ language: string; level: string }>();
  const courseQuery = useCourse(language as LearningLanguage, level as CEFRLevel);
  const progressQuery = useProgress();

  if (courseQuery.isPending || progressQuery.isPending) {
    return (
      <View style={styles.container}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  if (courseQuery.isError || progressQuery.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No pudimos cargar el curso</Text>
      </View>
    );
  }

  const course = courseQuery.data;
  const status = computePathStatus(course, progressQuery.data);
  const units = [...course.units].sort((a, b) => a.position - b.position);

  return (
    <ScrollView style={styles.container}>
      <StatsBar />
      <Text style={styles.title}>{course.title}</Text>
      {units.map((unit) => (
        <View key={unit.id} style={styles.unit}>
          <Text style={styles.unitTitle}>{unit.title}</Text>
          {[...unit.lessons]
            .sort((a, b) => a.position - b.position)
            .map((lesson) => {
              const lessonStatus = status[lesson.id];
              const locked = lessonStatus === 'locked';
              return (
                <Pressable
                  key={lesson.id}
                  testID={`lesson-${lesson.id}-${lessonStatus}`}
                  disabled={locked}
                  onPress={() => router.push(`/lesson/${lesson.id}`)}
                  style={[styles.lesson, locked && styles.lessonLocked]}
                >
                  <Text style={styles.lessonEmoji}>{STATUS_EMOJI[lessonStatus]}</Text>
                  <Text style={locked ? styles.lessonTextLocked : styles.lessonText}>
                    {lesson.title}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.md, backgroundColor: theme.colors.background },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: theme.space.md },
  unit: { marginBottom: theme.space.lg },
  unitTitle: { fontWeight: '700', color: theme.colors.textMuted, marginBottom: theme.space.sm },
  lesson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    borderColor: theme.colors.border,
    borderWidth: 1
  },
  lessonLocked: { opacity: 0.5 },
  lessonEmoji: { fontSize: 16 },
  lessonText: { color: theme.colors.text },
  lessonTextLocked: { color: theme.colors.textMuted },
  error: { color: theme.colors.danger }
});
