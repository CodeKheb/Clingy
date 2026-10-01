package com.clingy.overlay

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
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
import android.widget.TextView
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
  private var dismissTarget: TextView? = null
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

    // Latest mood pushed from JS, kept even while the service isn't running so a freshly
    // started bubble opens in the right animation (e.g. the "!" reminder) instead of idle.
    @Volatile
    var lastMood: String? = null

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
    dismissTarget?.let { windowManager.removeView(it) }
    dismissTarget = null
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
    // Same size and edge hang as the in-app Cling (PetFloatingFallback: 140x150 sprite at 0.6 scale,
    // sitting 32% of its width past the screen edge so only its hand pokes in).
    val density = resources.displayMetrics.density
    val widthPx = (84 * density).toInt()
    val heightPx = (90 * density).toInt()
    val hangPx = (widthPx * 0.32f).toInt()
    val imageView = ImageView(this).apply {
      setImageResource(R.drawable.idle_1)
      scaleType = ImageView.ScaleType.FIT_XY
      layoutParams = android.view.ViewGroup.LayoutParams(widthPx, heightPx)
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
      widthPx,
      heightPx,
      overlayType,
      // NO_LIMITS lets the window sit partly past the screen edge.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = screenWidth - widthPx + hangPx
      y = (screenHeight * 0.4).toInt()
    }

    val target = createDismissTarget(overlayType)
    dismissTarget = target

    // Is the finger over the dismiss circle? Uses the circle's real on-screen position.
    fun overDismissTarget(rawX: Float, rawY: Float): Boolean {
      val loc = IntArray(2)
      target.getLocationOnScreen(loc)
      val cx = loc[0] + target.width / 2f
      val cy = loc[1] + target.height / 2f
      val dx = rawX - cx
      val dy = rawY - cy
      return kotlin.math.sqrt(dx * dx + dy * dy) < target.width * 1.1f
    }

    var overTarget = false
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
            showDismissTarget(target)
          }
          if (isDragging) {
            params.x = (initialX + dx).coerceIn(-hangPx, screenWidth - widthPx + hangPx)
            params.y = (initialY + dy).coerceIn(0, screenHeight - heightPx)
            windowManager.updateViewLayout(view, params)
            val hot = overDismissTarget(event.rawX, event.rawY)
            if (hot != overTarget) {
              overTarget = hot
              target.animate().scaleX(if (hot) 1.3f else 1f).scaleY(if (hot) 1.3f else 1f).setDuration(120).start()
              (target.background as? GradientDrawable)?.setColor(
                if (hot) Color.parseColor("#FFFF6B35") else Color.parseColor("#CC1C2029")
              )
            }
          }
          true
        }
        MotionEvent.ACTION_CANCEL -> {
          hideDismissTarget(target)
          overTarget = false
          false
        }
        MotionEvent.ACTION_UP -> {
          hideDismissTarget(target)
          if (!isDragging) {
            openPanel()
          } else if (overTarget) {
            // Dropped on the X: shrink away and stop the overlay entirely.
            view.animate().scaleX(0f).scaleY(0f).alpha(0f).setDuration(160).withEndAction { stopSelf() }.start()
          } else {
            dockedRight = params.x + widthPx / 2 > screenWidth / 2
            val targetX = if (dockedRight) screenWidth - widthPx + hangPx else -hangPx
            snapToEdge(params, targetX)
          }
          true
        }
        else -> false
      }
    }

    bubbleView = imageView
    windowManager.addView(imageView, params)
    setAnimation(animationForMood(lastMood))
  }

  // Circle with an X, centred near the bottom of the screen; shown only while dragging.
  private fun createDismissTarget(overlayType: Int): TextView {
    val density = resources.displayMetrics.density
    val sizePx = (68 * density).toInt()
    val view = TextView(this).apply {
      text = "\u2715"
      textSize = 24f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#CC1C2029"))
        setStroke((2 * density).toInt(), Color.parseColor("#FFFF6B35"))
      }
      visibility = View.GONE
    }
    val params = WindowManager.LayoutParams(
      sizePx,
      sizePx,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = (88 * density).toInt() // clear of the gesture/nav bar
    }
    windowManager.addView(view, params)
    return view
  }

  private fun showDismissTarget(target: View) {
    target.scaleX = 0.8f
    target.scaleY = 0.8f
    target.alpha = 0f
    target.visibility = View.VISIBLE
    target.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(160).start()
  }

  private fun hideDismissTarget(target: View) {
    target.animate().alpha(0f).setDuration(120).withEndAction { target.visibility = View.GONE }.start()
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
          setAnimation(animationForMood(lastMood))
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
