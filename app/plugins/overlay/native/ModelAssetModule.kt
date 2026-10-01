package com.clingy.overlay

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

// Hands JS a file:// path to a model that ships inside the APK's assets. react-native-fast-tflite can
// only load web or file addresses, and in a release build a JS-required asset is just a resource name,
// so the model is copied out of assets once per install into private storage and loaded from there.
class ModelAssetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ClingModelAsset"

  @ReactMethod
  fun prepare(name: String, promise: Promise) {
    Thread {
      try {
        val context = reactApplicationContext
        // A new folder per install/update, so a changed model never reuses a stale copy.
        val stamp = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
        val dir = File(context.filesDir, "models-$stamp")
        val dest = File(dir, name)
        if (!dest.exists() || dest.length() == 0L) {
          dir.mkdirs()
          val tmp = File(dir, "$name.tmp")
          context.assets.open("models/$name").use { input ->
            tmp.outputStream().use { output -> input.copyTo(output) }
          }
          tmp.renameTo(dest)
          context.filesDir.listFiles { f -> f.isDirectory && f.name.startsWith("models-") && f != dir }
            ?.forEach { it.deleteRecursively() }
        }
        promise.resolve("file://" + dest.absolutePath)
      } catch (e: Exception) {
        promise.reject("E_MODEL_ASSET", e)
      }
    }.start()
  }
}
