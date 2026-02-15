package com.ar.backgroundlocation

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.pedro.library.view.OpenGlView
import java.lang.ref.WeakReference

class MainActivity : ComponentActivity() {

    private var savedUserId: String = ""

    companion object {
        var webViewRef: WeakReference<WebView>? = null
        var openGlViewRef: OpenGlView? = null
    }

    // Receiver to update HTML UI from Service
    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val status = intent?.getStringExtra("status") ?: ""
            webViewRef?.get()?.post {
                webViewRef?.get()?.evaluateJavascript("updateStreamStatus('$status')", null)
            }
        }
    }

    private val requestMultiplePermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            checkLocationPerm()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Using setContent for Jetpack Compose
        setContent {
            MainScreen(this)
        }

        // Register Receiver
        val filter = IntentFilter("STREAM_STATUS")
        ContextCompat.registerReceiver(this, statusReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)

        // Permission logic
        requestInitialPermissions()
    }

    private fun requestInitialPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestMultiplePermissions.launch(permissions.toTypedArray())
    }

    private fun checkLocationPerm() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 100)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(statusReceiver)
        } catch (e: Exception) {}
    }

    private fun startServiceCompat(intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    fun getAndroidInterface(): AndroidInterface = AndroidInterface(this)

    inner class AndroidInterface(private val mContext: Context) {
        @JavascriptInterface
        fun startTracking() {
            val intent = Intent(this@MainActivity, LocationService::class.java)
            intent.action = LocationService.ACTION_SERVICE_START
            startServiceCompat(intent)
        }

        @JavascriptInterface
        fun stopTracking() {
            val intent = Intent(this@MainActivity, LocationService::class.java)
            intent.action = LocationService.ACTION_SERVICE_STOP
            startService(intent)
        }

        @JavascriptInterface
        fun onLoginSuccess(UserId: String, role: String) {
            savedUserId = UserId 
            MainActivity.webViewRef?.get()?.let { wv ->
                wv.post {
                    if (role == "admin") {
                        try {
                            val serviceIntent = Intent(mContext, LocationService::class.java).apply {
                                action = LocationService.ACTION_START
                                putExtra("USER_ID", UserId)
                            }
                            startServiceCompat(serviceIntent)
                            val inputStream = mContext.assets.open("leaflet_map_server.html")
                            val size = inputStream.available()
                            val buffer = ByteArray(size)
                            inputStream.read(buffer)
                            inputStream.close()
                            val htmlContent = String(buffer)
                            wv.loadDataWithBaseURL("https://www.example.com/", htmlContent, "text/html", "UTF-8", null)
                        } catch (e: Exception) {
                            e.printStackTrace()
                            wv.loadUrl("file:///android_asset/leaflet_map_server.html")
                        }
                    } else if (role == "sender") {
                        try {
                            val serviceIntent = Intent(mContext, LocationService::class.java).apply {
                                action = LocationService.ACTION_START
                                putExtra("USER_ID", UserId)
                            }
                            startServiceCompat(serviceIntent)
                            val inputStream = mContext.assets.open("leaflet_map_service.html")
                            val size = inputStream.available()
                            val buffer = ByteArray(size)
                            inputStream.read(buffer)
                            inputStream.close()
                            val htmlContent = String(buffer)
                            wv.loadDataWithBaseURL("https://www.example.com/", htmlContent, "text/html", "UTF-8", null)
                        } catch (e: Exception) {
                            e.printStackTrace()
                            wv.loadUrl("file:///android_asset/leaflet_map_service.html")
                        }
                    }
                }
            }
        }

        @JavascriptInterface
        fun startStreaming(url: String) {
            if (!hasPermissions()) {
                requestPermissions()
                Toast.makeText(mContext, "Please grant Camera & Audio permissions", Toast.LENGTH_SHORT).show()
                return
            }
            // Check for Overlay Permission
            if (!Settings.canDrawOverlays(mContext)) {
                Toast.makeText(mContext, "Please enable 'Display over other apps'", Toast.LENGTH_LONG).show()
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                startActivity(intent)
                return
            }
            // Start Service
            val intent = Intent(mContext, StreamingService::class.java)
            intent.action = "START"
            intent.putExtra("URL", url)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.startForegroundService(intent)
            } else {
                mContext.startService(intent)
            }
        }

        @JavascriptInterface
        fun stopStreaming() {
            val intent = Intent(mContext, StreamingService::class.java)
            intent.action = "STOP"
            mContext.startService(intent)
        }

        private fun hasPermissions(): Boolean {
            return ActivityCompat.checkSelfPermission(mContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
                    ActivityCompat.checkSelfPermission(mContext, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        }

        private fun requestPermissions() {
            ActivityCompat.requestPermissions(
                this@MainActivity,
                arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO),
                101
            )
        }
    }
}
