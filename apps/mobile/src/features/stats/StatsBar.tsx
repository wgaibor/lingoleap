import { StyleSheet, Text, View } from 'react-native';
import type { LeagueDivision } from '@lingoleap/core';
import { theme } from '../../app/theme';
import { useLeague, useStats } from './queries';

const DIVISION_LABEL: Record<LeagueDivision, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  diamond: 'Diamante'
};

export function StatsBar() {
  const { data } = useStats();
  const { data: league } = useLeague();
  if (!data) return null;
  const levelTotal = data.xpIntoLevel + data.xpToNextLevel;
  const percent = levelTotal === 0 ? 0 : Math.round((data.xpIntoLevel / levelTotal) * 100);
  return (
    <View style={styles.bar}>
      <View style={styles.items}>
        <Text style={styles.item}>🔥 {data.streakCount}</Text>
        <Text style={styles.item}>❤️ {data.hearts}</Text>
        <Text style={styles.item}>💎 {data.gems}</Text>
        <Text style={styles.item}>🧊 {data.streakFreezes}</Text>
        {league && <Text style={styles.item}>🏆 {DIVISION_LABEL[league.division]}</Text>}
        <Text style={styles.item}>⚡ Nivel {data.level}</Text>
      </View>
      <View style={styles.levelTrack} accessibilityRole="progressbar">
        <View style={[styles.levelFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: theme.space.md,
    borderColor: theme.colors.border,
    borderWidth: 1
  },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  item: { color: theme.colors.text },
  levelTrack: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    marginTop: theme.space.sm,
    overflow: 'hidden'
  },
  levelFill: { height: 6, backgroundColor: theme.colors.primary }
});
