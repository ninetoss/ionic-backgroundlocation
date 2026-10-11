package com.ar.backgroundlocation

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.WindowManager
import android.view.ViewGroup
import android.view.Gravity
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.ar.backgroundlocation.LocationService.Companion.ACTION_START
import com.ar.backgroundlocation.LocationService.Companion.ACTION_STOP
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.json.JSONArray

class MainActivity : ComponentActivity() {

    private var userId: String = ""
    private var Name: String = ""
    private var userName: String = ""
    private var number: String = ""
    private var isLoggedIn: Boolean = false

    private val pollingIntervalMs: Long = 60000
    private val handler = Handler(Looper.getMainLooper())

    private val webViewReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val js = intent?.getStringExtra("JS_CODE")
            if (js != null) {
                persistentWebView?.evaluateJavascript(js, null)
            }
        }
    }

    companion object {
        @JvmStatic
        var persistentWebView: WebView? = null
        var webViewContainer: ViewGroup? = null 
        var isWebRTCActive: Boolean = false 
        var isBroadcasting: Boolean = false
        
        private val executorService = java.util.concurrent.Executors.newSingleThreadExecutor()
    }

    private var isWebViewInOverlay = false

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
            MainScreen(activity = this)
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

    private val requestMultiplePermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        // Permissions handled
        checkOverlayPermission()
    }

    private fun checkOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivityForResult(intent, 1001) 
        }
    }

    override fun onResume() {
        super.onResume()
        detachWebViewFromWindowManager()
        persistentWebView?.let { webView ->
            webView.resumeTimers()
            webView.onResume()
            webView.evaluateJavascript("if(typeof scheduleIceRestart === 'function') scheduleIceRestart();", null)
        }
    }

    override fun onStop() {
        super.onStop()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
            persistentWebView?.let { webView ->
                try {
                    (webView.parent as? ViewGroup)?.removeView(webView)
                    
                    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
                    val params = WindowManager.LayoutParams(
                        1, 1,
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) 
                            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY 
                        else 
                            WindowManager.LayoutParams.TYPE_PHONE,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or 
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                        WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                        PixelFormat.TRANSLUCENT
                    ).apply { gravity = Gravity.TOP or Gravity.START }
                    
                    wm.addView(webView, params)
                    isWebViewInOverlay = true
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (isWebViewInOverlay) {
            persistentWebView?.let { webView ->
                try {
                    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
                    wm.removeViewImmediate(webView)
                } catch (e: Exception) {}
                webViewContainer?.let { container ->
                    (webView.parent as? ViewGroup)?.removeView(webView)
                    webView.layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    container.addView(webView)
                }
                webView.post {
                    webView.requestLayout()
                    webView.invalidate()
                }
            }
            isWebViewInOverlay = false
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(boatFetchRunnable)
        unregisterReceiver(webViewReceiver)
        webViewContainer = null 
        persistentWebView?.removeJavascriptInterface("Android")
        persistentWebView = null
    }

    private fun detachWebViewFromWindowManager() {
        val webView = persistentWebView ?: return
        try {
            val wm = getSystemService(WINDOW_SERVICE) as WindowManager
            wm.removeViewImmediate(webView)
        } catch (e: Exception) {
            // Not attached or already removed
        }
    }

    private fun fetchLiveBoatsCSV() {
        executorService.execute {
            try {
                val dummyTime = System.currentTimeMillis()
                val csvUrl = URL("https://dntservicetruck.co.th/fetch_boats.php?dummy=$dummyTime")
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
                        var batchCount = 0

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
                            batchCount++

                            if (batchCount >= 50) {
                                val chunk = jsCommands.toString()
                                runOnUiThread {
                                    persistentWebView?.evaluateJavascript(chunk, null)
                                }
                                jsCommands.clear()
                                batchCount = 0
                            }
                        }

                        if (jsCommands.isNotEmpty()) {
                            val chunk = jsCommands.toString()
                            runOnUiThread {
                                persistentWebView?.evaluateJavascript(chunk, null)
                            }
                        }
                    }
                }
                csvConn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun fetchWfsBoatsData() {
        executorService.execute {
            try {
                val url = URL("https://dntservicetruck.co.th/fetch_wfs.php")
                val connection = url.openConnection() as HttpURLConnection
                connection.useCaches = false 
                connection.requestMethod = "GET"
                val inputStream = connection.inputStream
                val result = inputStream.bufferedReader().use { it.readText() }
                val jsonString = result.trim()

                val jsCommands = java.lang.StringBuilder()
                var batchCount = 0

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
                                val mmsi = properties.optString("mmsi", "").trim()
                                val callsign = properties.optString("callsign", "").trim()

                                if (shipName == "Coastal stations" || shipName == "AtoNs" || shipName.isEmpty()) {
                                    shipName = when {
                                        mmis.isNotEmpty() -> mmis
                                        mmsi.isNotEmpty() -> mmsi
                                        callsign.isNotEmpty() -> "Callsign: $callsign"
                                        else -> "Unknown Target"
                                    }
                                }

                                val heading = properties.optDouble("dir", 0.0)
                                val speed = properties.optDouble("speed", properties.optDouble("sog", properties.optDouble("SOG", 0.0)))
                                val safeName = shipName.replace("'", "\\'")

                                jsCommands.append("if(typeof window.receiveWfsBoatLocation === 'function') { window.receiveWfsBoatLocation('$safeName', $lat, $lng, $heading, $speed); } ")
                                batchCount++
                                if (batchCount >= 50) {
                                    val chunk = jsCommands.toString()
                                    runOnUiThread {
                                        persistentWebView?.evaluateJavascript(chunk, null)
                                    }
                                    jsCommands.clear()
                                    batchCount = 0
                                }
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
                            val mmsi = item.optString("mmsi", "").trim()
                            val callsign = item.optString("callsign", "").trim()

                            if (shipName == "Coastal stations" || shipName == "AtoNs" || shipName.isEmpty()) {
                                shipName = when {
                                    mmis.isNotEmpty() -> mmis
                                    mmsi.isNotEmpty() -> mmsi
                                    callsign.isNotEmpty() -> "Callsign: $callsign"
                                    else -> "Unknown Target"
                                }
                            }
                        
                            val heading = item.optDouble("dir", item.optDouble("heading", 0.0))
                            val speed = item.optDouble("speed", item.optDouble("sog", item.optDouble("SOG", 0.0)))
                            val safeName = shipName.replace("'", "\\'")

                            jsCommands.append("if(typeof window.receiveWfsBoatLocation === 'function') { window.receiveWfsBoatLocation('$safeName', $lat, $lng, $heading, $speed); } ")
                            batchCount++
                            if (batchCount >= 50) {
                                val chunk = jsCommands.toString()
                                runOnUiThread {
                                    persistentWebView?.evaluateJavascript(chunk, null)
                                }
                                jsCommands.clear()
                                batchCount = 0
                            }
                        }
                    }
                }

                if (jsCommands.isNotEmpty()) {
                    val chunk = jsCommands.toString()
                    runOnUiThread {
                        persistentWebView?.evaluateJavascript(chunk, null)
                    }
                }

            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun startServiceCompat(intent: Intent) {
        if (intent.action?.contains("STOP") == true) {
            try {
                startService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                startForegroundService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
                try {
                    startService(intent)
                } catch (_: Exception) {}
            }
        } else {
            try {
                startService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun getAndroidInterface(): AndroidInterface = AndroidInterface(this)

    inner class AndroidInterface(private val mContext: Context) {

        @JavascriptInterface
        fun downloadBase64PDF(base64: String, filename: String) {
            try {
                val base64Data = if (base64.contains(",")) base64.split(",")[1] else base64
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                val resolver = mContext.contentResolver
                val contentValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
                    }
                }
                val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use {
                        it.write(bytes)
                    }
                    
                    val pdfIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/pdf")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }
                    val pendingIntent = android.app.PendingIntent.getActivity(
                        mContext,
                        uri.hashCode(),
                        pdfIntent,
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                    )

                    val notificationManager = mContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        val channel = android.app.NotificationChannel("download_channel", "Downloads", android.app.NotificationManager.IMPORTANCE_HIGH)
                        notificationManager.createNotificationChannel(channel)
                    }
                    
                    val notification = androidx.core.app.NotificationCompat.Builder(mContext, "download_channel")
                        .setContentTitle("ดาวน์โหลดสำเร็จ")
                        .setContentText(filename)
                        .setSmallIcon(R.drawable.ic_launcher_background)
                        .setContentIntent(pendingIntent)
                        .setAutoCancel(true)
                        .build()
                        
                    notificationManager.notify(uri.hashCode(), notification)
                } else {
                    android.widget.Toast.makeText(mContext, "ไม่สามารถสร้างไฟล์ได้", android.widget.Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                android.widget.Toast.makeText(mContext, "เกิดข้อผิดพลาดในการดาวน์โหลด", android.widget.Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun startTracking() {
            val intent = Intent(this@MainActivity, LocationService::class.java)
            intent.action = ACTION_START
            intent.putExtra("USER_ID", userId)
            intent.putExtra("NUMBER", number)
            intent.putExtra("NAME", userName)
            intent.putExtra("USERNAME", Name)
            startServiceCompat(intent)
        }

        @JavascriptInterface
        fun stopTracking() {
            val intent = Intent(this@MainActivity, LocationService::class.java)
            intent.action = ACTION_STOP
            startServiceCompat(intent)
        }

        @JavascriptInterface
        fun onLoginSuccess(id: String, role: String, username: String, name: String, number: String, token: String) {
            userId = id
            userName = username
            this@MainActivity.number = number
            Name = name
            isLoggedIn = true

            // Save session to SharedPreferences
            val prefs = mContext.getSharedPreferences("LocationAppPrefs", android.content.Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString("USER_ID", id)
                putString("USER_ROLE", role)
                putString("USERNAME", username)
                putString("NAME", name)
                putString("NUMBER", number)
                apply()
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
                                } catch (_: Exception) {}
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
                            runOnUiThread { request.grant(request.resources) }
                        }
                    }

                    if (role == "admin") {
                        try {
                            val htmlContent = mContext.assets.open("leaflet_map_server.html")
                                .bufferedReader().use { it.readText() }
                            wv.loadDataWithBaseURL("https://dntservicetruck.co.th/", htmlContent, "text/html", "UTF-8", null)
                        } catch (e: Exception) {
                            e.printStackTrace()
                            wv.loadUrl("file:///android_asset/leaflet_map_server.html")
                        }
                    } else if (role == "sender") {
                        try {
                            val htmlContent = mContext.assets.open("leaflet_map_service.html")
                                .bufferedReader().use { it.readText() }
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
        fun logout() {
            isLoggedIn = false
            userId = ""
            userName = ""
            this@MainActivity.number = ""
            Name = ""
            val prefs = mContext.getSharedPreferences("LocationAppPrefs", android.content.Context.MODE_PRIVATE)
            prefs.edit().clear().apply()
        }

        @JavascriptInterface
        fun getUserId(): String = userId

        @JavascriptInterface
        fun getUserName(): String = userName

        @JavascriptInterface
        fun getName(): String = Name

        @JavascriptInterface
        fun getNumber(): String = number

        @JavascriptInterface
        fun setLandscape() {
            this@MainActivity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        }

        @JavascriptInterface
        fun setPortrait() {
            this@MainActivity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }

        @JavascriptInterface
        fun startWebRTC() {
            if (!hasPermissions()) { requestPermissions(); return }
            isWebRTCActive = true
            val intent = Intent(mContext, LocationService::class.java).apply {
                action = LocationService.ACTION_START_WEBRTC
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.startForegroundService(intent)
            } else {
                mContext.startService(intent)
            }
        }

        @JavascriptInterface
        fun stopWebRTC() {
            isWebRTCActive = false
            val intent = Intent(mContext, LocationService::class.java).apply {
                action = LocationService.ACTION_STOP_WEBRTC
            }
            startServiceCompat(intent)
        }

        @JavascriptInterface
        fun startBroadcast() {
            if (!hasPermissions()) { requestPermissions(); return }
            isBroadcasting = true
            val intent = Intent(mContext, LocationService::class.java).apply {
                action = LocationService.ACTION_START_BROADCAST
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.startForegroundService(intent)
            } else {
                mContext.startService(intent)
            }
        }

        @JavascriptInterface
        fun stopBroadcast() {
            isBroadcasting = false
            val intent = Intent(mContext, LocationService::class.java).apply {
                action = LocationService.ACTION_STOP_BROADCAST
            }
            startServiceCompat(intent)
        }

        private fun hasPermissions(): Boolean =
            ActivityCompat.checkSelfPermission(mContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(mContext, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

        private fun requestPermissions() {
            ActivityCompat.requestPermissions(
                this@MainActivity,
                arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO),
                101
            )
        }

        @JavascriptInterface
        fun setSimulationMode(isSimulated: Boolean) {
            val intent = Intent(mContext, LocationService::class.java).apply {
                action = LocationService.ACTION_SET_SIMULATION_MODE
                putExtra("IS_SIMULATED", isSimulated)
            }
            if (isSimulated) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        mContext.startForegroundService(intent)
                    } catch (e: Exception) {
                        try { mContext.startService(intent) } catch (_: Exception) {}
                    }
                } else {
                    try { mContext.startService(intent) } catch (_: Exception) {}
                }
            } else {
                try {
                    mContext.startService(intent)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        @JavascriptInterface
        fun updateSimulatedLocation(lat: Double, lng: Double, heading: Double, speed: Double) {
            val intent = Intent(mContext, LocationService::class.java).apply {
                action = LocationService.ACTION_UPDATE_SIMULATED_LOCATION
                putExtra("LAT", lat)
                putExtra("LNG", lng)
                putExtra("HEADING", heading)
                putExtra("SPEED", speed)
            }
            try {
                mContext.startService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}