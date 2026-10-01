// Owner: Person C — Cling's mood states/animations, uses pet/PetWidget.tsx.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClingSprite } from '../pet/ClingSprite';
import type { ClingMood } from '../pet/PetWidget';

const MOODS: ClingMood[] = ['happy', 'neutral', 'stressed', 'urgent'];

export function PetScreen() {
  const [mood, setMood] = useState<ClingMood>('neutral');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Cling</Text>

      <View style={styles.stage}>
        <ClingSprite animation={mood === 'happy' ? 'happy' : mood === 'neutral' ? 'idle' : 'reminder'} />
      </View>

      <View style={styles.moodRow}>
        {MOODS.map((m) => (
          <Pressable
            key={m}
            onPress={() => setMood(m)}
            style={[styles.moodButton, mood === m && styles.moodButtonActive]}
          >
            <Text style={[styles.moodLabel, mood === m && styles.moodLabelActive]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.previewGrid}>
        <PreviewCell label="idle" animation="idle" />
        <PreviewCell label="blink" animation="blink" />
        <PreviewCell label="poke" animation="poke" />
        <PreviewCell label="drag" animation="drag" />
        <PreviewCell label="snap" animation="snap" />
        <PreviewCell label="reminder" animation="reminder" />
        <PreviewCell label="happy" animation="happy" />
        <PreviewCell label="sleep" animation="sleep" />
      </View>
    </ScrollView>
  );
}

function PreviewCell({ label, animation }: { label: string; animation: Parameters<typeof ClingSprite>[0]['animation'] }) {
  return (
    <View style={styles.previewCell}>
      <ClingSprite animation={animation} />
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  stage: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  moodButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eee',
  },
  moodButtonActive: {
    backgroundColor: '#ff8c3b',
  },
  moodLabel: {
    fontSize: 14,
    color: '#333',
  },
  moodLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  previewCell: {
    alignItems: 'center',
    width: 100,
  },
  previewLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
});
