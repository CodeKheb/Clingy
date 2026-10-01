package com.clingy.overlay

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import com.clingy.R

// Draws a draggable, animated bubble over other apps using WindowManager, and
// opens the app's RN panel screen (via its own deep link) when tapped, rather
// than rendering RN/Fabric content directly inside this Service — that path
// is unsupported without an Activity. See PLAN.md.
//
// Mirrors (in native code) the two RN pieces this bubble has no other way to
// share with: pet/clingFrames.ts (frame sequences/durations) and
// pet/PetFloatingFallback.tsx (edge-snap drag physics).
class OverlayService : Service() {
  private lateinit var windowManager: WindowManager
  private var bubbleView: ImageView? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private var currentAnimation = ANIM_IDLE
  private var frameIndex = 0
  private var dockedRight = true
  private var snapAnimator: ValueAnimator? = null

  private val frameRunnable = object : Runnable {
    override fun run() {
      val frames = FRAMES[currentAnimation] ?: FRAMES[ANIM_IDLE]!!
      frameIndex = (frameIndex + 1) % frames.size
      bubbleView?.setImageResource(frames[frameIndex])
      val duration = FRAME_DURATION[currentAnimation] ?: 450L
      mainHandler.postDelayed(this, duration)
    }
  }

  companion object {
    const val CHANNEL_ID = "clingy_overlay"
    const val NOTIFICATION_ID = 1001
    const val EXTRA_MOOD = "mood"
    const val EXTRA_APP_FOREGROUND = "appForeground"

    @Volatile
    var isRunning = false

    const val ANIM_IDLE = "idle"
    const val ANIM_DRAG = "drag"
    const val ANIM_SNAP = "snap"
    const val ANIM_REMINDER = "reminder"
    const val ANIM_HAPPY = "happy"

    // Same source frames as assets/cling/*.png, copied into res/drawable by
    // the config plugin; mirrors clingFrames.ts's CLING_FRAMES map (minus
    // blink/poke/sleep, which the floating bubble has no trigger for).
    val FRAMES: Map<String, IntArray> = mapOf(
      ANIM_IDLE to intArrayOf(R.drawable.idle_1, R.drawable.idle_2, R.drawable.idle_3),
      ANIM_DRAG to intArrayOf(R.drawable.drag_1, R.drawable.drag_2),
      ANIM_SNAP to intArrayOf(R.drawable.snap_1, R.drawable.snap_2, R.drawable.snap_3),
      ANIM_REMINDER to intArrayOf(
        R.drawable.reminder_1,
        R.drawable.reminder_2,
        R.drawable.reminder_3,
        R.drawable.reminder_4,
      ),
      ANIM_HAPPY to intArrayOf(R.drawable.happy_1, R.drawable.happy_2, R.drawable.happy_3),
    )

    // Mirrors clingFrames.ts's CLING_FRAME_DURATION.
    val FRAME_DURATION: Map<String, Long> = mapOf(
      ANIM_IDLE to 450L,
      ANIM_DRAG to 150L,
      ANIM_SNAP to 110L,
      ANIM_REMINDER to 200L,
      ANIM_HAPPY to 220L,
    )

    // Mirrors PetWidget.tsx's MOOD_ANIMATION map (neutral/happy only use
    // non-looping-reaction animations here; stressed/urgent both read as the
    // reminder animation, same as in-app).
    fun animationForMood(mood: String?): String = when (mood) {
      "happy" -> ANIM_HAPPY
      "stressed", "urgent" -> ANIM_REMINDER
      else -> ANIM_IDLE
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    startForeground(NOTIFICATION_ID, buildNotification())
    addBubble()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val mood = intent?.getStringExtra(EXTRA_MOOD)
    if (mood != null) setAnimation(animationForMood(mood))
    if (intent?.hasExtra(EXTRA_APP_FOREGROUND) == true) {
      bubbleView?.visibility = if (intent.getBooleanExtra(EXTRA_APP_FOREGROUND, false)) {
        View.GONE
      } else {
        View.VISIBLE
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    isRunning = false
    mainHandler.removeCallbacks(frameRunnable)
    snapAnimator?.cancel()
    bubbleView?.let { windowManager.removeView(it) }
    bubbleView = null
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Cling overlay",
        NotificationManager.IMPORTANCE_MIN
      )
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Cling is watching your deadlines")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .build()
  }

  private fun setAnimation(name: String) {
    if (currentAnimation == name) return
    currentAnimation = name
    frameIndex = 0
    mainHandler.removeCallbacks(frameRunnable)
    bubbleView?.setImageResource(FRAMES[name]?.get(0) ?: R.drawable.cling_bubble)
    bubbleView?.scaleX = if (dockedRight) 1f else -1f
    mainHandler.post(frameRunnable)
  }

  private fun addBubble() {
    val sizePx = (84 * resources.displayMetrics.density).toInt()
    val imageView = ImageView(this).apply {
      setImageResource(R.drawable.idle_1)
      layoutParams = android.view.ViewGroup.LayoutParams(sizePx, sizePx)
    }

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val screenWidth = resources.displayMetrics.widthPixels
    val screenHeight = resources.displayMetrics.heightPixels

    val params = WindowManager.LayoutParams(
      sizePx,
      sizePx,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = screenWidth - sizePx
      y = (screenHeight * 0.4).toInt()
    }

    var initialX = 0
    var initialY = 0
    var initialTouchX = 0f
    var initialTouchY = 0f
    var isDragging = false

    imageView.setOnTouchListener { view, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          snapAnimator?.cancel()
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          isDragging = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - initialTouchX).toInt()
          val dy = (event.rawY - initialTouchY).toInt()
          if (!isDragging && (kotlin.math.abs(dx) > 8 || kotlin.math.abs(dy) > 8)) {
            isDragging = true
            setAnimation(ANIM_DRAG)
          }
          if (isDragging) {
            params.x = (initialX + dx).coerceIn(0, screenWidth - sizePx)
            params.y = (initialY + dy).coerceIn(0, screenHeight - sizePx)
            windowManager.updateViewLayout(view, params)
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!isDragging) {
            openPanel()
          } else {
            dockedRight = params.x + sizePx / 2 > screenWidth / 2
            val targetX = if (dockedRight) screenWidth - sizePx else 0
            snapToEdge(params, targetX)
          }
          true
        }
        else -> false
      }
    }

    bubbleView = imageView
    windowManager.addView(imageView, params)
    setAnimation(ANIM_IDLE)
  }

  // Ported from PetFloatingFallback.tsx's onPanResponderRelease: decide dock
  // side by final position (not gesture velocity), then spring into place.
  private fun snapToEdge(params: WindowManager.LayoutParams, targetX: Int) {
    setAnimation(ANIM_SNAP)
    val startX = params.x
    snapAnimator = ValueAnimator.ofInt(startX, targetX).apply {
      duration = 220
      interpolator = OvershootInterpolator(1.2f)
      addUpdateListener { animator ->
        params.x = animator.animatedValue as Int
        bubbleView?.let { if (it.isAttachedToWindow) windowManager.updateViewLayout(it, params) }
      }
      addListener(object : android.animation.AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: android.animation.Animator) {
          bubbleView?.scaleX = if (dockedRight) 1f else -1f
          setAnimation(ANIM_IDLE)
        }
      })
      start()
    }
  }

  // Routes through the app's own clingy:// deep link scheme (already
  // registered for OAuth) instead of a custom Activity intent extra, so the
  // RN side only needs the existing Linking API, not a MainActivity.kt patch.
  private fun openPanel() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("clingy://cling-panel")).apply {
      setPackage(packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    }
    startActivity(intent)
  }
}
