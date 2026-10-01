import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getStoredTokens } from './src/auth/googleAuth';
import { initPriorityScorer } from './src/priority';
import { verifyEmbeddingSanity } from './src/priority/tfliteScorer';
import { PetFloatingFallback } from './src/pet/PetFloatingFallback';
import { useClingMood } from './src/pet/useClingMood';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { syncNow } from './src/sync/syncService';

export default function App() {
  const mood = useClingMood();
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null = still checking

  useEffect(() => {
    void getStoredTokens().then((tokens) => setSignedIn(tokens !== null));
  }, []);

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

  if (signedIn === null) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      {signedIn ? (
        <HomeScreen />
      ) : (
        <LoginScreen
          onSignedIn={() => {
            setSignedIn(true);
            void syncNow();
          }}
        />
      )}
      <PetFloatingFallback mood={mood} onPress={() => {}} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
