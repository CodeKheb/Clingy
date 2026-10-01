package com.clingy.overlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Bridge RN calls to the overlay permission flow and the OverlayService
// lifecycle. See OverlayService.kt for why the overlay itself is a plain
// native bubble rather than RN content.
class OverlayModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ClingOverlay"

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(reactApplicationContext)
    } else {
      true
    }
    promise.resolve(granted)
  }

  // Overlay permission is a "special" permission: no in-app runtime dialog,
  // always a redirect to a system Settings page. The user must flip a toggle
  // there and return manually — there's no direct granted/denied callback.
  @ReactMethod
  fun requestPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}")
      ).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      reactApplicationContext.startActivity(intent)
    }
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
      Settings.canDrawOverlays(reactApplicationContext)
    if (!granted) {
      promise.resolve(false)
      return
    }
    // Started from inside the app, so the bubble stays hidden until the app is backgrounded
    // (the in-app Cling is already on screen).
    val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
      putExtra(OverlayService.EXTRA_APP_FOREGROUND, true)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactApplicationContext.startForegroundService(intent)
    } else {
      reactApplicationContext.startService(intent)
    }
    promise.resolve(true)
  }

  // The overlay can end without JS knowing (dragged onto the dismiss X), so ask rather than remember.
  @ReactMethod
  fun isOverlayRunning(promise: Promise) {
    promise.resolve(OverlayService.isRunning)
  }

  @ReactMethod
  fun stopOverlay() {
    reactApplicationContext.stopService(Intent(reactApplicationContext, OverlayService::class.java))
  }

  // Pushes the current Cling mood (from pet/useClingMood.ts) into the overlay
  // service so the floating bubble's animation matches the in-app widget.
  // Only takes effect while the overlay is already running — starting a
  // foreground service here if it weren't would pop the bubble up on its own
  // the moment mood changes, even if the user never enabled it.
  @ReactMethod
  fun setMood(mood: String) {
    OverlayService.lastMood = mood
    if (!OverlayService.isRunning) return
    val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
      putExtra(OverlayService.EXTRA_MOOD, mood)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactApplicationContext.startForegroundService(intent)
    } else {
      reactApplicationContext.startService(intent)
    }
  }

  // Hides the floating bubble while the app itself is in the foreground
  // (PetFloatingFallback already shows an in-app Cling then) and reveals it
  // again once the app backgrounds — called from App.tsx's AppState
  // listener. Only takes effect while the overlay is already running, same
  // guard as setMood.
  @ReactMethod
  fun setAppForeground(foreground: Boolean) {
    if (!OverlayService.isRunning) return
    val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
      putExtra(OverlayService.EXTRA_APP_FOREGROUND, foreground)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactApplicationContext.startForegroundService(intent)
    } else {
      reactApplicationContext.startService(intent)
    }
  }
}
