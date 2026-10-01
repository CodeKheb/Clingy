import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { initPriorityScorer } from './src/priority';
import { verifyEmbeddingSanity } from './src/priority/tfliteScorer';
import { PetFloatingFallback } from './src/pet/PetFloatingFallback';
import { PetScreen } from './src/screens/PetScreen';
import { useClingMood } from './src/pet/useClingMood';

export default function App() {
  const mood = useClingMood();

  useEffect(() => {
    // Async: loads the MiniLM model + precomputes anchor embeddings. Falls back
    // to the heuristic scorer until (or unless) this resolves successfully.
    // In __DEV__ this also runs and logs the embedding sanity check (HANDOFF step 3).
    void initPriorityScorer().then((ready) => {
      if (!ready) {
        console.warn('[priority] running on heuristic fallback — model failed to load');
        return;
      }
      // HANDOFF step 3: the on-device go/no-go for the community model conversion.
      if (__DEV__) {
        const report = verifyEmbeddingSanity();
        console.log(
          `[priority] sanity ${report.ok ? 'PASS' : 'FAIL'} — similar=${report.similarPairSimilarity.toFixed(3)} ` +
            `different=${report.differentPairSimilarity.toFixed(3)} order=${report.inputOrder}`
        );
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <PetScreen />
      <PetFloatingFallback mood={mood} onPress={() => {}} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
