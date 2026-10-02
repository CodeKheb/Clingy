import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getStoredTokens, signOut } from './src/auth/googleAuth';
import { schemaReady } from './src/db/schema';
import { initPriorityScorer } from './src/priority';
import { verifyEmbeddingSanity } from './src/priority/tfliteScorer';
import { PetFloatingFallback } from './src/pet/PetFloatingFallback';
import { setOverlayAppForeground, setOverlayMood } from './src/pet/overlayBridge';
import { useClingMood } from './src/pet/useClingMood';
import { useClingNudge } from './src/pet/useClingNudge';
import { ClassScreen } from './src/screens/ClassScreen';
import { ClingPanel } from './src/screens/ClingPanel';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { startBackgroundSync, stopBackgroundSync } from './src/sync/backgroundSync';
import { getMeta } from './src/db/queries';
import { LAST_SYNCED_KEY, syncNow } from './src/sync/syncService';

// Keep the Cling splash up until the database and sign-in check are done, instead of flashing a blank view.
void SplashScreen.preventAutoHideAsync().catch(() => {});

type Tab = 'home' | 'schedule' | 'class';

type DeepLink = 'panel' | Tab | null;

const TAB_BY_NAV = { Home: 'home', Schedule: 'schedule', Class: 'class' } as const;

/** clingy://cling-panel opens the chat; clingy://home, /schedule and /class open those tabs. */
function parseDeepLink(url: string | null): DeepLink {
  if (url === null) return null;
  const host = Linking.parse(url).hostname;
  if (host === 'cling-panel') return 'panel';
  return host === 'home' || host === 'schedule' || host === 'class' ? host : null;
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
  const nudge = useClingNudge();
  const insets = useSafeAreaInsets();
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null = still checking
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');

  useEffect(() => {
    void getStoredTokens().then((tokens) => setSignedIn(tokens !== null));
  }, []);

  // Single entry point for syncing: screens read SQLite only on mount, so
  // bumping syncVersion (used as their key) makes them reload after a sync.
  const [syncVersion, setSyncVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ at: string | null; offline: boolean }>({ at: null, offline: false });
  const syncingRef = useRef(false);
  const lastSyncRef = useRef(0);
  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setRefreshing(true);
    try {
      const result = await syncNow();
      if (!result.ok) console.warn('[sync] failed:', result.error);
      setSyncStatus({ at: await getMeta(LAST_SYNCED_KEY), offline: !result.ok });
      lastSyncRef.current = Date.now();
      setSyncVersion((v) => v + 1);
    } finally {
      syncingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Sync on launch / right after sign-in, and whenever the app returns to the
  // foreground (throttled to once a minute).
  useEffect(() => {
    if (signedIn !== true) return;
    void getMeta(LAST_SYNCED_KEY).then((at) => setSyncStatus((prev) => ({ ...prev, at })));
    void runSync();
    // Periodic sync while the app is closed; the OS decides when it actually runs.
    startBackgroundSync().catch((e) => console.warn('[sync] background sync unavailable:', e));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastSyncRef.current > 60_000) void runSync();
    });
    return () => subscription.remove();
  }, [signedIn, runSync]);

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
    const open = (url: string | null) => {
      const target = parseDeepLink(url);
      if (target === 'panel') setPanelOpen(true);
      else if (target) {
        setPanelOpen(false);
        setTab(target);
      }
    };
    void Linking.getInitialURL().then(open);
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Async: loads the MiniLM model + precomputes anchor embeddings. Until (or
    // unless) this succeeds, task types come from title keywords alone.
    // In __DEV__ this also runs and logs the embedding sanity check.
    void initPriorityScorer().then((ready) => {
      if (!ready) {
        console.warn('[priority] running on heuristic fallback — model failed to load');
        return;
      }
      // Dev-only go/no-go for the community model conversion: logs whether the embeddings are sane.
      if (__DEV__) {
        const report = verifyEmbeddingSanity();
        console.log(
          `[priority] sanity ${report.ok ? 'PASS' : 'FAIL'} — similar=${report.similarPairSimilarity.toFixed(3)} ` +
          `different=${report.differentPairSimilarity.toFixed(3)} order=${report.inputOrder}`
        );
      }
    });
  }, []);

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

  const appReady = signedIn !== null && databaseStatus !== 'loading';
  useEffect(() => {
    if (appReady) void SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  if (signedIn === null) {
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {panelOpen ? (
        <ClingPanel onClose={() => setPanelOpen(false)} />
      ) : signedIn ? (
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          {tab === 'home' ? (
            <HomeScreen
              key={syncVersion}
              refreshing={refreshing}
              syncStatus={syncStatus}
              onRefresh={() => void runSync()}
              onSelectTab={(t) => setTab(TAB_BY_NAV[t])}
              onSignOut={() => {
                void signOut();
                void stopBackgroundSync();
                setSignedIn(false);
              }}
            />
          ) : tab === 'class' ? (
            <ClassScreen
              onSelectTab={(t) => setTab(TAB_BY_NAV[t])}
              onSignOut={() => {
                void signOut();
                void stopBackgroundSync();
                setSignedIn(false);
              }}
            />
          ) : (
            <ScheduleScreen
              key={syncVersion}
              onSelectTab={(t) => setTab(TAB_BY_NAV[t])}
              onSignOut={() => {
                void signOut();
                void stopBackgroundSync();
                setSignedIn(false);
              }}
            />
          )}
        </View>
      ) : (
        <LoginScreen
          onSignedIn={() => setSignedIn(true)}
        />
      )}
      {!panelOpen && (
        <PetFloatingFallback mood={mood} onPress={() => setPanelOpen(true)} bottomInset={insets.bottom} nudge={nudge} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f131c',
  },
});
