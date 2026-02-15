package com.ar.backgroundlocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.hardware.Camera // <--- NEW IMPORT
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.SurfaceView
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.pedro.library.rtmp.RtmpCamera1
import com.pedro.common.ConnectChecker

class StreamingService : Service(), ConnectChecker {

    private var rtmpCamera: RtmpCamera1? = null
    private var surfaceView: SurfaceView? = null
    private var windowManager: WindowManager? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(101, createNotification())

        try {
            windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val localSurfaceView = SurfaceView(this)
            surfaceView = localSurfaceView
            
            // 1x1 Pixel Overlay (Hidden)
            val layoutParams = WindowManager.LayoutParams(
                1, 1,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) 
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY 
                else 
                    WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or 
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or 
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
            )
            layoutParams.gravity = Gravity.TOP or Gravity.START
            
            windowManager?.addView(localSurfaceView, layoutParams)
            
            // Initialize Encoder
            rtmpCamera = RtmpCamera1(localSurfaceView, this)
            
        } catch (e: Exception) {
            e.printStackTrace()
            updateUI("Status: Error - " + e.message)
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val url = intent?.getStringExtra("URL") ?: ""

        if (action == "START" && url.isNotEmpty()) {
            if (rtmpCamera?.isStreaming == false) {
                if (rtmpCamera?.prepareAudio() == true && rtmpCamera?.prepareVideo() == true) {
                    
                    // --- CHANGED: Force Rear Camera ---
                    // Explicitly start preview with the Back Camera before streaming
                    rtmpCamera?.startPreview(Camera.CameraInfo.CAMERA_FACING_BACK)
                    
                    rtmpCamera?.startStream(url)
                } else {
                    updateUI("Status: Hardware Error (Restart App)")
                }
            } else if (rtmpCamera?.isStreaming == true) {
                 updateUI("Status: Already Live")
            }
        } else if (action == "STOP") {
            rtmpCamera?.stopStream()
            rtmpCamera?.stopPreview() // <--- Stop preview explicitly
            updateUI("Status: Stopped")
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            if (rtmpCamera?.isStreaming == true) rtmpCamera?.stopStream()
            rtmpCamera?.stopPreview() // <--- Ensure camera is released
            surfaceView?.let { windowManager?.removeView(it) }
        } catch (e: Exception) {}
    }

    override fun onConnectionSuccess() = updateUI("Status: Live (Connected)")
    override fun onConnectionFailed(reason: String) {
        updateUI("Status: Failed - $reason")
        // Retry logic could go here, but for now we let the user retry
        if (rtmpCamera?.isStreaming == true) rtmpCamera?.stopStream()
        // Note: We leave preview running in case they want to retry immediately, 
        // or you can call stopPreview() here too.
    }
    
    override fun onNewBitrate(bitrate: Long) { /* Optional: Update UI with bitrate */ }
    override fun onDisconnect() = updateUI("Status: Disconnected")
    override fun onAuthError() = updateUI("Status: Auth Error")
    override fun onAuthSuccess() = updateUI("Status: Auth Success")
    override fun onConnectionStarted(url: String) {
        updateUI("Status: Connecting...")
    }

    private fun updateUI(status: String) {
        val intent = Intent("STREAM_STATUS")
        intent.setPackage(packageName)
        intent.putExtra("status", status)
        sendBroadcast(intent)
    }

    private fun createNotification(): Notification {
        val channelId = "streaming_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Live Streaming", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Broadcasting Live")
            .setContentText("Your stream is active in the background.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .build()
    }
}