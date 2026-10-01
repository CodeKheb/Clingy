import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Pressable, ActivityIndicator, StyleSheet, Text, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { schemaReady } from './src/db/schema';
import { getStoredTokens } from './src/auth/googleAuth';
import { initPriorityScorer } from './src/priority';
import { verifyEmbeddingSanity } from './src/priority/tfliteScorer';
import { PetFloatingFallback } from './src/pet/PetFloatingFallback';
import { setOverlayAppForeground, setOverlayMood } from './src/pet/overlayBridge';
import { useClingMood } from './src/pet/useClingMood';
import { ClingPanel } from './src/screens/ClingPanel';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { syncNow } from './src/sync/syncService';

type Tab = 'home' | 'schedule';

function isClingPanelUrl(url: string | null): boolean {
  return url !== null && Linking.parse(url).hostname === 'cling-panel';
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const mood = useClingMood();
  const insets = useSafeAreaInsets();
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null = still checking
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');

  useEffect(() => {
    void getStoredTokens().then((tokens) => setSignedIn(tokens !== null));
  }, []);

  // Keeps the native floating bubble's animation (if running) in sync with
  // the same mood driving the in-app widget — a no-op while the overlay is
  // off (see OverlayModule.setMood).
  useEffect(() => {
    setOverlayMood(mood);
  }, [mood]);

  // Hides the native floating bubble while this app is in the foreground —
  // PetFloatingFallback already renders Cling in-app then, so showing both
  // would double them up. Fires once on mount too, since the overlay may
  // have been left running from a previous session.
  useEffect(() => {
    setOverlayAppForeground(true);
    const subscription = AppState.addEventListener('change', (state) => {
      setOverlayAppForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Opened via the overlay bubble's clingy://cling-panel deep link, or the
    // in-app floating fallback's onPress below.
    void Linking.getInitialURL().then((url) => {
      if (isClingPanelUrl(url)) setPanelOpen(true);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isClingPanelUrl(url)) setPanelOpen(true);
    });
    return () => subscription.remove();
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
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  const [databaseStatus, setDatabaseStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let mounted = true;
    schemaReady.then(
      () => mounted && setDatabaseStatus('ready'),
      (error) => {
        console.error('Failed to initialize the local database:', error);
        if (mounted) setDatabaseStatus('error');
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  if (databaseStatus !== 'ready') {
    return (
      <View style={styles.container}>
        {databaseStatus === 'loading' ? (
          <ActivityIndicator accessibilityLabel="Preparing local database" />
        ) : (
          <Text>Could not prepare local data. Please restart the app.</Text>
        )}
        <StatusBar style="auto" />
      </View>
    );
  }
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
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabLabel: {
    color: '#888',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#ff8c3b',
  },
});
