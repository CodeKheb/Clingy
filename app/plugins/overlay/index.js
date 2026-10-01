// Local Expo config plugin: wires the native Cling overlay bubble into the
// generated Android project during prebuild.
//
// - Copies OverlayService.kt / OverlayModule.kt / OverlayPackage.kt into the
//   app's native source tree.
// - Copies the bubble drawable resource.
// - Registers OverlayPackage in MainApplication.kt's package list.
// - Declares OverlayService in AndroidManifest.xml (SYSTEM_ALERT_WINDOW is
//   already present via another plugin's manifest merge).
//
// Re-run `npx expo prebuild --platform android` after editing anything here.

const { withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_DIR = 'com/clingy/overlay';
const NATIVE_FILES = ['OverlayService.kt', 'OverlayModule.kt', 'OverlayPackage.kt', 'ModelAssetModule.kt'];

// The on-device model ships as a native Android asset (see ModelAssetModule.kt) rather than through Metro.
const MODEL_FILES = ['all-MiniLM-L6-v2-quant.tflite'];

function withOverlayNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        PACKAGE_DIR,
      );
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of NATIVE_FILES) {
        const src = path.join(__dirname, 'native', file);
        fs.copyFileSync(src, path.join(destDir, file));
      }

      const drawableDestDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/drawable',
      );
      fs.mkdirSync(drawableDestDir, { recursive: true });

      // Bubble fallback icon.
      fs.copyFileSync(
        path.join(__dirname, 'res/drawable/cling_bubble.png'),
        path.join(drawableDestDir, 'cling_bubble.png'),
      );

      // Full sprite animation frame set (same source PNGs the RN side uses
      // via require('../../assets/cling/*.png')), so the native overlay can
      // cycle frames instead of showing one static image.
      const clingFramesDir = path.join(__dirname, '../../assets/cling');
      for (const file of fs.readdirSync(clingFramesDir)) {
        if (!file.endsWith('.png')) continue;
        fs.copyFileSync(path.join(clingFramesDir, file), path.join(drawableDestDir, file));
      }

      const modelsDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/assets/models');
      fs.mkdirSync(modelsDir, { recursive: true });
      for (const file of MODEL_FILES) {
        fs.copyFileSync(path.join(__dirname, '../../assets/models', file), path.join(modelsDir, file));
      }

      return config;
    },
  ]);
}

function withOverlayManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return config;

    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    for (const perm of ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE']) {
      const already = manifest['uses-permission'].some((p) => p.$?.['android:name'] === perm);
      if (!already) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    }

    if (!application.service) application.service = [];
    const alreadyDeclared = application.service.some(
      (s) => s.$?.['android:name'] === '.overlay.OverlayService',
    );
    if (!alreadyDeclared) {
      application.service.push({
        $: {
          'android:name': '.overlay.OverlayService',
          'android:foregroundServiceType': 'specialUse',
          'android:exported': 'false',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'cling_mascot_overlay',
            },
          },
        ],
      });
    }
    return config;
  });
}

function withOverlayPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const marker = 'PackageList(this).packages.apply {';
    const importLine = 'import com.clingy.overlay.OverlayPackage';
    let contents = config.modResults.contents;

    if (!contents.includes(importLine)) {
      contents = contents.replace(
        'import com.facebook.react.PackageList',
        `import com.facebook.react.PackageList\n${importLine}`,
      );
    }

    if (!contents.includes('OverlayPackage()')) {
      contents = contents.replace(
        marker,
        `${marker}\n          add(OverlayPackage())`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withOverlay(config) {
  config = withOverlayNativeFiles(config);
  config = withOverlayManifest(config);
  config = withOverlayPackageRegistration(config);
  return config;
};
