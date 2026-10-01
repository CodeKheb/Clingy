// Owner: Person A — Google login screen, uses auth/googleAuth.ts.
// Styled to match the app's shared design system (src/screens/utils/theme.ts):
// dark Material You surface, rounded pills, orange primary CTA. The mascot hero
// mirrors the Stitch mockup (warm hero, mascot, single Google button, ToS note).

import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { signInWithGoogle, type StoredTokens } from '../auth/googleAuth';
import { ClingSprite } from '../pet/ClingSprite';
import { C } from './utils/theme';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'alarm-outline', label: 'Deadline reminders' },
  { icon: 'calendar-outline', label: 'Smart study plan' },
  { icon: 'cloud-offline-outline', label: 'Works offline' },
];

export type LoginScreenProps = {
  onSignedIn: (tokens: StoredTokens) => void;
};

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const handlePress = async () => {
    if (signingIn) return;
    setError(null);
    setSigningIn(true);
    try {
      const result = await signInWithGoogle();
      if (result.type === 'success') {
        onSignedIn(result.tokens);
        return;
      }
      if (result.type === 'error') {
        setError(result.message);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Decorative warm glow behind the hero */}
      <View style={styles.heroGlow} />

      <View style={styles.hero}>
        {/* Mascot: the bundled transparent sprite, so it sits on the background with no frame and works offline */}
        <ClingSprite animation="idle" scale={1.5} />

        {/* Wordmark + tagline */}
        <Text style={styles.title}>Clingy</Text>
        <Text style={styles.tagline}>
          Your offline study companion. Cling keeps your deadlines, schedule, and
          focus in one place — even without a signal.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.feature}>
              <Ionicons name={f.icon} size={14} color={C.primary} />
              <Text style={styles.featureText}>{f.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.googleButton, signingIn && styles.googleButtonDisabled]}
          onPress={handlePress}
          disabled={signingIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
        >
          {signingIn ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <Ionicons name="logo-google" size={18} color={C.white} />
          )}
          <Text style={styles.googleText}>
            {signingIn ? 'Connecting…' : 'Sign in with Google'}
          </Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.terms}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: C.primaryContainer + '26',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.surfaceContainer,
  },
  featureText: { fontSize: 12, fontWeight: '600', color: C.onSurfaceVariant },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: C.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },
  footer: {
    gap: 12,
    paddingBottom: 32,
  },
  googleButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: C.primaryContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.1,
  },
  error: {
    fontSize: 13,
    color: C.error,
    textAlign: 'center',
    lineHeight: 18,
  },
  terms: {
    fontSize: 11,
    color: C.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.8,
  },
});
