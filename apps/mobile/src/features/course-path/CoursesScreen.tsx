import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../app/theme';
import { useCourses } from './queries';

export function CoursesScreen() {
  const router = useRouter();
  const { data, isPending, isError } = useCourses();

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No pudimos cargar los cursos</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(course) => course.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/course/${item.language}/${item.level}`)}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>Nivel {item.level}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.md, backgroundColor: theme.colors.background },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    borderColor: theme.colors.border,
    borderWidth: 1
  },
  title: { fontWeight: '700', color: theme.colors.text },
  subtitle: { color: theme.colors.textMuted, marginTop: theme.space.xs },
  error: { color: theme.colors.danger }
});
