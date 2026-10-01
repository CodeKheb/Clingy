// Owner: Person A — Google login screen, uses auth/googleAuth.ts.
// Styled to match the app's shared design system (src/screens/utils/theme.ts):
// dark Material You surface, rounded pills, orange primary CTA. The mascot hero
// mirrors the Stitch mockup (warm hero, mascot, single Google button, ToS note).

import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { signInWithGoogle, type StoredTokens } from '../auth/googleAuth';
import { C } from './utils/theme';

const MASCOT_LOGIN =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAuIQJRjaMKnlJ4foJqyoYXkPPNZqZ0VwJZ8sBI_cfOp1h3zK0VcPE6L-yAL5yG7ptv93fxOoEtqo9E37K6JcDcLmXga2Z-HMHbvaP63hpcVKsdf3LhgL2MBL41IHUUDiwHUB-JYYkBJlP85_3xisINRc2U_zmeyOnjXAAVE7sgzGwRehuiHcu6g6MSFl4aAQPS_xE_UpqFXkyDLlGzqYrowWRJAV8rGRM8ZMr665PG5zOv8K9lKT2gwVMmzh0f1xrj1g';

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
        {/* Mascot logo (transparent, no frame) */}
        <Image source={{ uri: MASCOT_LOGIN }} style={styles.mascotImg} />

        {/* Wordmark + tagline */}
        <Text style={styles.title}>Clingy</Text>
        <Text style={styles.tagline}>
          Your offline study companion. Cling keeps your deadlines, schedule, and
          focus in one place — even without a signal.
        </Text>
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
            <Text style={styles.googleIcon}>G</Text>
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
  mascotImg: {
    width: 176,
    height: 176,
    resizeMode: 'contain',
  },
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
  googleIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
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
