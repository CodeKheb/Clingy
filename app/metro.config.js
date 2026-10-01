// Adds `tflite` so Metro bundles the MiniLM model asset required by
// react-native-fast-tflite's loadTensorflowModel(require('./model.tflite')).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('tflite');

module.exports = config;
