import { registerRootComponent } from 'expo';

// Ensure the task definition is loaded during normal and headless launches.
import './src/sync/backgroundSync';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
