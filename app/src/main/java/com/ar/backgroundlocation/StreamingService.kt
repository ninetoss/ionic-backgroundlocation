package com.ar.backgroundlocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import androidx.core.app.NotificationCompat

class StreamingService : Service() {

    private var windowManager: WindowManager? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaSession: android.media.session.MediaSession? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        var isServiceRunning = false
    }

    override fun onCreate() {
        super.onCreate()
        isServiceRunning = true
        
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        // Use a Partial WakeLock to keep CPU alive
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BackGroundLocation:StreamWakeLock")
        wakeLock?.acquire()

        // Create MediaSession to help keep the media pipeline open
        mediaSession = android.media.session.MediaSession(this, "WebRTCStreaming").apply {
            isActive = true
        }
    }

    private fun startForegroundServiceInternal() {
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(101, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(101, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        
        // Only trigger foreground status for actions that actually need the media pipeline/overlay active.
        // MOVE_TO_FOREGROUND is just a signal and doesn't need to trigger a notification if not already active.
        if (action == "START_WEBRTC" || action == "MOVE_TO_BACKGROUND") {
            startForegroundServiceInternal()
        }
        
        when (action) {
            "MOVE_TO_BACKGROUND" -> {
                MainActivity.persistentWebView?.let { wv ->
                    mainHandler.post {
                        try {
                            // Detach from current layout
                            (wv.parent as? android.view.ViewGroup)?.removeView(wv)
                            
                            if (windowManager == null) {
                                windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
                            }
                            
                            try { windowManager?.removeView(wv) } catch (e: Exception) {}

                            // Use a small overlay window. FLAG_NOT_TOUCHABLE and FLAG_NOT_FOCUSABLE 
                            // are key for background transparency.
                            val layoutParams = WindowManager.LayoutParams(
                                1, 1, 
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                                else
                                    @Suppress("DEPRECATION")
                                    WindowManager.LayoutParams.TYPE_PHONE,
                                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                                PixelFormat.TRANSLUCENT
                            )
                            layoutParams.gravity = Gravity.TOP or Gravity.START
                            layoutParams.x = 0
                            layoutParams.y = 0
                            
                            windowManager?.addView(wv, layoutParams)
                            
                            // Critical: Resuming WebView and its timers keeps the JS/WebRTC loop alive
                            wv.onResume()
                            wv.resumeTimers()
                            
                            Log.d("StreamingService", "WebView successfully moved to 1x1 overlay")
                        } catch (e: Exception) {
                            Log.e("StreamingService", "Error during MOVE_TO_BACKGROUND", e)
                        }
                    }
                }
            }
            "MOVE_TO_FOREGROUND" -> {
                MainActivity.persistentWebView?.let { wv ->
                    mainHandler.post {
                        try {
                            // Remove from WindowManager Overlay
                            try { windowManager?.removeView(wv) } catch (e: Exception) {}
                            
                            // Signal Activity to re-attach
                            val intentBroadcast = Intent("com.ar.backgroundlocation.REACH_WEBVIEW")
                            sendBroadcast(intentBroadcast)
                            
                            Log.d("StreamingService", "WebView moving to foreground")
                        } catch (e: Exception) {
                            Log.e("StreamingService", "Error moving WebView to foreground", e)
                        }
                    }
                }
            }
            "START_WEBRTC" -> {
                Log.d("StreamingService", "Status: WebRTC Background Active")
            }
            "STOP_WEBRTC" -> {
                cleanup()
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun cleanup() {
        try {
            MainActivity.persistentWebView?.let { wv ->
                mainHandler.post {
                    try { windowManager?.removeView(wv) } catch (e: Exception) {}
                }
            }
            windowManager = null
            mediaSession?.isActive = false
            mediaSession?.release()
        } catch (e: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        cleanup()
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
    }

    private fun createNotification(): Notification {
        val channelId = "streaming_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "WebRTC Streaming", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("WebRTC Active")
            .setContentText("Background camera and microphone are active.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
}
