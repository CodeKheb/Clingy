import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PetFloatingFallback } from './src/pet/PetFloatingFallback';
import type { ClingMood } from './src/pet/PetWidget';
import { PetScreen } from './src/screens/PetScreen';

export default function App() {
  const [mood] = useState<ClingMood>('neutral');

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
