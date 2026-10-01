// Owner: Person A — Google login screen, uses auth/googleAuth.ts.
// TODO(Person A): design the actual screen. This is just the wiring:
// call signInWithGoogle() and hand the tokens to onSignedIn() on success.

import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import { signInWithGoogle, type StoredTokens } from '../auth/googleAuth';

export type LoginScreenProps = {
  onSignedIn: (tokens: StoredTokens) => void;
};

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null);

  const handlePress = async () => {
    setError(null);
    const result = await signInWithGoogle();
    if (result.type === 'success') {
      onSignedIn(result.tokens);
    } else if (result.type === 'error') {
      setError(result.message);
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Sign in with Google" onPress={handlePress} />
      {error && <Text>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
