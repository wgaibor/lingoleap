import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../src/app/theme';

export default function LessonPlaceholder() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Próximamente</Text>
      <Text style={styles.subtitle}>El reproductor de lecciones llega en la Fase 4B.</Text>
      <Text style={styles.lessonId}>Lección: {lessonId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    backgroundColor: theme.colors.background
  },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  subtitle: { color: theme.colors.textMuted, marginTop: theme.space.sm, textAlign: 'center' },
  lessonId: { color: theme.colors.textMuted, marginTop: theme.space.md, fontSize: 12 }
});
