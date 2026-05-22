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
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import com.ar.backgroundlocation.LocationService.Companion.ACTION_START
import com.ar.backgroundlocation.LocationService.Companion.ACTION_STOP
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.json.JSONArray

class MainActivity : ComponentActivity() {

    private var userId: String = ""
    private var userName: String = ""
    private var number: String = ""
    private var jwtToken: String = "" 
    private var isLoggedIn: Boolean = false

    private val pollingIntervalMs: Long = 60000 
    private val handler = Handler(Looper.getMainLooper())

    private val boatFetchRunnable = object : Runnable {
        override fun run() {
            if (isLoggedIn) {
                fetchLiveBoatsCSV()
                fetchWfsBoatsData()
            }
            handler.postDelayed(this, pollingIntervalMs) 
        }
    }

    private fun startBoatPolling() {
        handler.removeCallbacks(boatFetchRunnable)
        handler.post(boatFetchRunnable)
    }

    companion object {
        var webViewRef: WeakReference<WebView>? = null
        var persistentWebView: WebView? = null
        var isWebRTCActive: Boolean = false
    }

    private val requestMultiplePermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            checkLocationPerm()
        }
    }

    private val webViewReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.ar.backgroundlocation.REACH_WEBVIEW") {
                // Critical: Ensure the WebView is detached from the background overlay 
                // BEFORE triggering the Compose recomposition to prevent the white screen freeze.
                // We use a Handler instead of wv.post to avoid deadlocks when the WebView is detached.
                persistentWebView?.let { wv ->
                    (wv.parent as? ViewGroup)?.removeView(wv)
                    // Reset layout params to match Activity's container
                    wv.layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    
                    // Trigger recomposition
                    setContent {
                        MainScreen(this@MainActivity)
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Signal background service to release WebView back to activity
        if (StreamingService.isServiceRunning) {
            val intent = Intent(this, StreamingService::class.java)
            intent.action = "MOVE_TO_FOREGROUND"
            startService(intent)
        }
        
        // Ensure WebView is resumed if it was already attached
        persistentWebView?.let { wv ->
            wv.onResume()
            wv.resumeTimers()
        }
    }

    override fun onStop() {
        super.onStop()
        // We move to background only if we are actively streaming.
        if (isWebRTCActive) {
            persistentWebView?.let { wv ->
                val intent = Intent(this, StreamingService::class.java)
                intent.action = "MOVE_TO_BACKGROUND"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        ContextCompat.registerReceiver(
            this,
            webViewReceiver,
            IntentFilter("com.ar.backgroundlocation.REACH_WEBVIEW"),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        requestInitialPermissions()

        setContent {
            MainScreen(this)
        }
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

    private fun fetchLiveBoatsCSV() {
        Thread {
            try {
                val triggerUrl = URL("https://dntservicetruck.co.th/fetch_boats.php")
                val triggerConn = triggerUrl.openConnection() as HttpURLConnection
                triggerConn.useCaches = false 
                triggerConn.requestMethod = "GET"
                triggerConn.inputStream.bufferedReader().use { it.readText() }
                triggerConn.disconnect()

                val dummyTime = System.currentTimeMillis()
                val csvUrl = URL("https://dntservicetruck.co.th/latest_tracking.csv?dummy=$dummyTime")
                val csvConn = csvUrl.openConnection() as HttpURLConnection
                csvConn.useCaches = false 
                csvConn.requestMethod = "GET"

                if (csvConn.responseCode == HttpURLConnection.HTTP_OK) {
                    val csvText = csvConn.inputStream.bufferedReader().use { it.readText() }
                    val lines = csvText.trim().split("\n")
                
                    if (lines.size > 1) {
                        val headers = lines[0].split(",").map { it.trim().replace("\"", "") }
                    
                        val latIdx = headers.indexOf("รุ้ง")
                        val lngIdx = headers.indexOf("แวง")
                        val nameIdx = headers.indexOf("ชื่อเรือ")
                        val headingIdx = headers.indexOf("ทิศทาง")
                        val speedIdx = if (headers.indexOf("ความเร็ว") != -1) headers.indexOf("ความเร็ว") else headers.indexOf("Speed")

                        val jsCommands = java.lang.StringBuilder()

                        for (i in 1 until lines.size) {
                            if (lines[i].isBlank()) continue
                        
                            val cols = lines[i].split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)".toRegex())
                            if (cols.size <= maxOf(latIdx, lngIdx)) continue

                            val lat = cols[latIdx].toDoubleOrNull() ?: continue
                            val lng = cols[lngIdx].toDoubleOrNull() ?: continue
                        
                            val name = if (nameIdx >= 0 && cols.size > nameIdx) {
                                cols[nameIdx].replace("\"", "")
                                             .replace("'", "\\'")
                                             .replace("\r", "")
                                             .replace("\n", "") 
                            } else "Unknown CSV"
                        
                            var heading = 45.0
                            if (headingIdx >= 0 && cols.size > headingIdx) {
                                heading = cols[headingIdx].replace("°", "").replace("\r", "").toDoubleOrNull() ?: 45.0
                            }

                            var speed = 0.0
                            if (speedIdx >= 0 && cols.size > speedIdx) {
                                val rawSpeed = cols[speedIdx].replace("[^\\d.]".toRegex(), "")
                                speed = rawSpeed.toDoubleOrNull() ?: 0.0
                            }

                            jsCommands.append("if(typeof window.receiveLiveBoatLocation === 'function') { window.receiveLiveBoatLocation('$name', $lat, $lng, $heading, $speed); } ")
                        }

                        runOnUiThread {
                            persistentWebView?.evaluateJavascript(jsCommands.toString(), null)
                        }
                    }
                }
                csvConn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    private fun fetchWfsBoatsData() {
        Thread {
            try {
                val dummyTime = System.currentTimeMillis()
                val url = URL("https://dntservicetruck.co.th/fetch_wfs.php?dummy=$dummyTime")
                val connection = url.openConnection() as HttpURLConnection
                connection.useCaches = false 
                connection.requestMethod = "GET"
                val inputStream = connection.inputStream
                val result = inputStream.bufferedReader().use { it.readText() }
                val jsonString = result.trim()

                val jsCommands = java.lang.StringBuilder()

                if (jsonString.startsWith("{")) {
                    val jsonObject = JSONObject(jsonString)
                    val features = jsonObject.optJSONArray("features")
                
                    if (features != null) {
                        for (i in 0 until features.length()) {
                            val feature = features.getJSONObject(i)
                            val properties = feature.optJSONObject("properties") ?: JSONObject()
                            val geometry = feature.optJSONObject("geometry")

                            var lat = Double.NaN
                            var lng = Double.NaN

                            if (geometry != null) {
                                val coordinates = geometry.optJSONArray("coordinates")
                                if (coordinates != null && coordinates.length() >= 2) {
                                    lng = coordinates.optDouble(0, Double.NaN)
                                    lat = coordinates.optDouble(1, Double.NaN)
                                }
                            }

                            if (!lat.isNaN() && !lng.isNaN()) {
                                var shipName = properties.optString("name", "").trim()
                                val mmis = properties.optString("mmis", "").trim()
                                val callsign = properties.optString("callsign", "").trim()

                                if (shipName == "Coastal stations" || shipName.isEmpty()) {
                                    shipName = when {
                                        mmis.isNotEmpty() -> mmis
                                        callsign.isNotEmpty() -> "Callsign: $callsign"
                                        else -> "Unknown Target"
                                    }
                                }

                                val heading = properties.optDouble("dir", 0.0)
                                val speed = properties.optDouble("speed", properties.optDouble("sog", properties.optDouble("SOG", 0.0)))
                                val safeName = shipName.replace("'", "\\'")

                                jsCommands.append("if(typeof window.receiveWfsBoatLocation === 'function') { window.receiveWfsBoatLocation('$safeName', $lat, $lng, $heading, $speed); } ")
                            }
                        }
                    }
                } 
                else if (jsonString.startsWith("[")) {
                    val jsonArray = JSONArray(jsonString)
                    for (i in 0 until jsonArray.length()) {
                        val item = jsonArray.getJSONObject(i)
                    
                        val lat = item.optDouble("latitude", item.optDouble("lat", Double.NaN))
                        val lng = item.optDouble("longitude", item.optDouble("lng", Double.NaN))
                    
                        if (!lat.isNaN() && !lng.isNaN()) {
                            var shipName = item.optString("name", "").trim()
                            val mmis = item.optString("mmis", "").trim()
                            val callsign = item.optString("callsign", "").trim()

                            if (shipName == "Coastal stations" || shipName.isEmpty()) {
                                shipName = when {
                                    mmis.isNotEmpty() -> mmis
                                    callsign.isNotEmpty() -> "Callsign: $callsign"
                                    else -> "Unknown Target"
                                }
                            }
                        
                            val heading = item.optDouble("dir", item.optDouble("heading", 0.0))
                            val speed = item.optDouble("speed", item.optDouble("sog", item.optDouble("SOG", 0.0)))
                            val safeName = shipName.replace("'", "\\'")

                            jsCommands.append("if(typeof window.receiveWfsBoatLocation === 'function') { window.receiveWfsBoatLocation('$safeName', $lat, $lng, $heading, $speed); } ")
                        }
                    }
                }

                if (jsCommands.isNotEmpty()) {
                    runOnUiThread {
                        persistentWebView?.evaluateJavascript(jsCommands.toString(), null)
                    }
                }

            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
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
            intent.action = ACTION_START
            intent.putExtra("USER_ID", userId)
            intent.putExtra("NUMBER", number)
            startServiceCompat(intent)
        }

        @JavascriptInterface
        fun stopTracking() {
            val intent = Intent(this@MainActivity, LocationService::class.java)
            intent.action = ACTION_STOP
            startServiceCompat(intent) 
        }

        @JavascriptInterface
        fun onLoginSuccess(id: String, role: String, username: String, userNumber: String, token: String) {
            userId = id 
            userName = username
            number = userNumber
            jwtToken = token 
            isLoggedIn = true

            runOnUiThread {
                persistentWebView?.evaluateJavascript("if(typeof onLoginSuccess === 'function') onLoginSuccess('$id', '$role', '$username', '$userNumber', '$token');", null)
            }

            startBoatPolling()
    
            persistentWebView?.let { wv ->
                wv.post {
                    wv.webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                            val url = request?.url?.toString() ?: return null
                            
                            if (url.contains(".php")) return null

                            if (url.startsWith("https://dntservicetruck.co.th/")) {
                                try {
                                    val assetPath = url.replace("https://dntservicetruck.co.th/", "")
                                    if (assetPath.isEmpty() || assetPath == "/") return null

                                    val mimeType = when {
                                        assetPath.contains(".html") -> "text/html"
                                        assetPath.contains(".js") -> "text/javascript"
                                        assetPath.contains(".css") -> "text/css"
                                        assetPath.contains(".svg") -> "image/svg+xml"
                                        assetPath.contains(".png") -> "image/png"
                                        assetPath.contains(".jpg") -> "image/jpeg"
                                        assetPath.contains(".gif") -> "image/gif"
                                        assetPath.contains(".json") -> "application/json"
                                        else -> "text/plain"
                                    }
                                    val inputStream = mContext.assets.open(assetPath)
                                    return WebResourceResponse(mimeType, "UTF-8", inputStream)
                                } catch (_: Exception) {
                                }
                            }
                            return super.shouldInterceptRequest(view, request)
                        }
                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            startBoatPolling()
                        }
                    }

                    wv.webChromeClient = object : android.webkit.WebChromeClient() {
                        override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                            runOnUiThread {
                                request.grant(request.resources)
                            }
                        }
                    }

                    if (role == "admin") {
                        try {
                            val inputStream = mContext.assets.open("leaflet_map_server.html")
                            val size = inputStream.available()
                            val buffer = ByteArray(size)
                            inputStream.read(buffer)
                            inputStream.close()
                            val htmlContent = String(buffer)
                            
                            wv.loadDataWithBaseURL("https://dntservicetruck.co.th/", htmlContent, "text/html", "UTF-8", null)
                        } catch (e: Exception) {
                            e.printStackTrace()
                            wv.loadUrl("file:///android_asset/leaflet_map_server.html")
                        }
                    } else if (role == "sender") {
                        try {
                            val inputStream = mContext.assets.open("leaflet_map_service.html")
                            val size = inputStream.available()
                            val buffer = ByteArray(size)
                            inputStream.read(buffer)
                            inputStream.close()
                            val htmlContent = String(buffer)
                            
                            wv.loadDataWithBaseURL("https://dntservicetruck.co.th/", htmlContent, "text/html", "UTF-8", null)
                        } catch (e: Exception) {
                            e.printStackTrace()
                            wv.loadUrl("file:///android_asset/leaflet_map_service.html")
                        }
                    }
                }
            }
        }

        @JavascriptInterface
        fun getUserId(): String = userId

        @JavascriptInterface
        fun getUserName(): String = userName

        @JavascriptInterface
        fun getNumber(): String = number

        @JavascriptInterface
        fun getToken(): String = jwtToken

        @JavascriptInterface
        fun moveToBackground() {
            val intent = Intent(mContext, StreamingService::class.java)
            intent.action = "MOVE_TO_BACKGROUND"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.startForegroundService(intent)
            } else {
                mContext.startService(intent)
            }
        }

        @JavascriptInterface
        fun startWebRTC() {
            if (!hasPermissions()) {
                requestPermissions()
                return
            }
            if (!Settings.canDrawOverlays(mContext)) {
                Toast.makeText(mContext, "Please enable 'Display over other apps' for background camera support", Toast.LENGTH_LONG).show()
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, "package:$packageName".toUri())
                startActivity(intent)
                return
            }
            isWebRTCActive = true
            val intent = Intent(mContext, StreamingService::class.java)
            intent.action = "START_WEBRTC"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.startForegroundService(intent)
            } else {
                mContext.startService(intent)
            }
        }

        @JavascriptInterface
        fun stopWebRTC() {
            isWebRTCActive = false
            val intent = Intent(mContext, StreamingService::class.java)
            intent.action = "STOP_WEBRTC"
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
