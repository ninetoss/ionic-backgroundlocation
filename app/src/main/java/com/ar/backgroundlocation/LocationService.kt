package com.ar.backgroundlocation

import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

private const val TAG = "LocationService"

class LocationService : Service(), LocationUpdatesCallBack {
    private lateinit var gpsLocationClient: GPSLocationClient
    private var notificationBuilder: NotificationCompat.Builder? = null
    private var notificationManager: NotificationManager? = null
    
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    
    private val fileLock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executorService = java.util.concurrent.Executors.newSingleThreadExecutor()

    private var currentUserId: String = "0"
    private var currentNumber: String = "0"
    private var currentName: String = "0"

    private var lastFetchTime: Long = 0
    private var lastNotificationTime: Long = 0

    override fun onCreate() {
        super.onCreate()
        gpsLocationClient = GPSLocationClient(this)
        gpsLocationClient.setLocationUpdatesCallBack(this)

        setupNetworkMonitor()
        fetchInactiveShipsFromServer()
        
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        currentUserId = prefs.getString(KEY_USER_ID, "0") ?: "0"
        currentNumber = prefs.getString(KEY_NUMBER, "0") ?: "0"
        currentName = prefs.getString(KEY_NAME, "0") ?: "0"
        
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    }
    
    private fun setupNetworkMonitor() {
        connectivityManager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                super.onAvailable(network)
                Log.d(TAG, "Internet connection established. Starting sync...")
                syncStoredData()
            }
        }

        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback!!)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback", e)
        }
    }

    override fun onDestroy() {
        networkCallback?.let {
            connectivityManager.unregisterNetworkCallback(it)
        }
        stopService()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val userId = intent?.getStringExtra("USER_ID")
        if (userId != null) {
            currentUserId = userId
            val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            prefs.edit { putString(KEY_USER_ID, userId) }
        }
        val number = intent?.getStringExtra("NUMBER")
        if (number != null) {
            currentNumber = number
            val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            prefs.edit { putString(KEY_NUMBER, number) }
        }
        val name = intent?.getStringExtra("NAME")
        if (name != null) {
            currentName = name
            val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            prefs.edit { putString(KEY_NAME, name) }
        }
        when (intent?.action) {
            ACTION_START -> startService()
            ACTION_STOP -> stopService()
            ACTION_START_WEBRTC -> startWebRTC()
            ACTION_STOP_WEBRTC -> stopWebRTC()
            ACTION_START_BROADCAST -> startBroadcast()
            ACTION_STOP_BROADCAST -> stopBroadcast()
            ACTION_SET_SIMULATION_MODE -> {
                isSimulatedMode = intent.getBooleanExtra("IS_SIMULATED", false)
                if (isSimulatedMode) {
                    updateNotification("Simulating Patrol Boat", "Patrol boat simulation active")
                } else {
                    if (isTracking) {
                        val currentStatusTitle = when {
                            isBroadcasting -> "Broadcast Active"
                            isWebRTCActive -> "Streaming Active"
                            else -> "Tracking location..."
                        }
                        updateNotification(currentStatusTitle, "Searching...")
                    } else if (!isWebRTCActive && !isBroadcasting) {
                        stopForeground(STOP_FOREGROUND_REMOVE)
                        stopSelf()
                    }
                }
            }
            ACTION_UPDATE_SIMULATED_LOCATION -> {
                val lat = intent.getDoubleExtra("LAT", 0.0)
                val lng = intent.getDoubleExtra("LNG", 0.0)
                val bearing = intent.getDoubleExtra("HEADING", 0.0)
                val speed = intent.getDoubleExtra("SPEED", 0.0)

                if (isSimulatedMode) {
                    updateNotification("Simulating Patrol Boat", "Lat: ${String.format("%.4f", lat)}, Lng: ${String.format("%.4f", lng)}")
                }

                if (System.currentTimeMillis() - lastSimulatedSendTime >= 3000) {
                    lastSimulatedSendTime = System.currentTimeMillis()
                    
                    val simLoc = Location("simulated").apply {
                        latitude = lat
                        longitude = lng
                        this.bearing = bearing.toFloat()
                        this.speed = speed.toFloat()
                        time = System.currentTimeMillis()
                    }
                    
                    val userId = currentUserId
                    val number = currentNumber
                    val name = currentName
                    
                    if (isNetworkAvailable()) {
                        sendLocationToServer(simLoc, userId, number, name)
                    } else {
                        saveLocationToInternalStorage(simLoc, userId, number, name)
                    }
                }
            }
        }
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        stopService()
    }

    override fun onBind(p0: Intent?): IBinder? {
        return null
    }

    companion object {
        var isTracking = false
        var isWebRTCActive = false
        var isBroadcasting = false
        var isSimulatedMode = false
        var lastSimulatedSendTime = 0L
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_START_WEBRTC = "ACTION_START_WEBRTC"
        const val ACTION_STOP_WEBRTC = "ACTION_STOP_WEBRTC"
        const val ACTION_START_BROADCAST = "ACTION_START_BROADCAST"
        const val ACTION_STOP_BROADCAST = "ACTION_STOP_BROADCAST"
        const val ACTION_SET_SIMULATION_MODE = "ACTION_SET_SIMULATION_MODE"
        const val ACTION_UPDATE_SIMULATED_LOCATION = "ACTION_UPDATE_SIMULATED_LOCATION"
        private const val PREFS_NAME = "LocationPrefs"
        private const val KEY_USER_ID = "UserId"
        private const val KEY_NUMBER = "Number"
        private const val KEY_NAME = "Name"
        private const val OFFLINE_FILE = "offline_locations.json"
    }

    private fun startService() {
        if (isTracking) return
        isTracking = true
        
        gpsLocationClient.startLocationUpdates()
        sendStatusToServer("online")
        
        updateNotification("Tracking location...", "Searching...")
    }

    private fun startWebRTC() {
        isWebRTCActive = true
        MainActivity.isWebRTCActive = true

        updateNotification("Streaming Active", "Video/Audio transmission running in background")

        val notification = createNotification("Streaming Active", "Video/Audio transmission running in background")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                       ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (isTracking) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
            startForeground(1, notification, type)
        } else {
            startForeground(1, notification)
        }
    }

    private fun stopWebRTC() {
        isWebRTCActive = false
        MainActivity.isWebRTCActive = false

        if (isTracking || isBroadcasting) {
            updateNotification(
                if (isBroadcasting) "Broadcast Active" else "Tracking location...",
                if (isBroadcasting) "Sending audio commands..." else "Running..."
            )
        } else {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun startBroadcast() {
        isBroadcasting = true
        updateNotification("Broadcast Active", "Sending audio commands to all users")

        val notification = createNotification("Broadcast Active", "Sending audio commands to all users")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (isTracking) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            if (isWebRTCActive) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            startForeground(1, notification, type)
        } else {
            startForeground(1, notification)
        }
    }

    private fun stopBroadcast() {
        isBroadcasting = false
        if (isTracking || isWebRTCActive) {
            updateNotification(
                if (isWebRTCActive) "Streaming Active" else "Tracking location...",
                if (isWebRTCActive) "Video/Audio transmission running..." else "Running..."
            )
        } else {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun updateNotification(title: String, content: String) {
        if (notificationManager == null) return
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "location",
                "Location",
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager?.createNotificationChannel(channel)
        }

        val notification = createNotification(title, content)
        
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var t = 0
            if (isTracking || isSimulatedMode) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            if (isWebRTCActive) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (isBroadcasting) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (t == 0) t = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            t
        } else 0

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type != 0) {
            startForeground(1, notification, type)
        } else {
            startForeground(1, notification)
        }
    }

    private fun createNotification(title: String, content: String): android.app.Notification {
        val notificationIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP 
        }
        
        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            pendingIntentFlags
        )

        notificationBuilder = NotificationCompat.Builder(this, "location")
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_launcher_background)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)

        return notificationBuilder!!.build()
    }

    private fun stopService() {
        if (!isTracking && !isWebRTCActive) return
        isTracking = false
        isWebRTCActive = false
        MainActivity.isWebRTCActive = false
        
        gpsLocationClient.stopLocationUpdates()
        gpsLocationClient.setLocationUpdatesCallBack(null)
        sendStatusToServer("offline")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun locationException(message: String) {
        Log.d(TAG, message)
    }

    private fun sendStatusToServer(status: String) {
        val userId = currentUserId
        if (userId == "0" || userId.isEmpty()) return

        executorService.execute {
            try {
                val url = URL("https://dntservicetruck.co.th/locationservice.php")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")

                val postData = "UserId=${userId}&status=${status}"

                conn.outputStream.use { it.write(postData.toByteArray()) }
                Log.d(TAG, "Status update ($status) sent. Server response: ${conn.responseCode}")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Send status failed", e)
            }
        }
    }

    private fun fetchLocationFromServer() {
        executorService.execute {
            try {
                val url = URL("https://dntservicetruck.co.th/location.json")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                
                if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                    val rawText = conn.inputStream.bufferedReader().use { it.readText() }               
                    val jsonString = if (rawText.trim().startsWith("[")) rawText else "[$rawText]"
                    val jsonArray = JSONArray(jsonString)
                    
                    val activeUserIds = JSONArray()

                    for (i in 0 until jsonArray.length()) {
                        val json = jsonArray.getJSONObject(i)    
                        val userId = json.optString("UserId", "")
                        val number = json.optString("Number", "")
                        val name = json.optString("Name", "")
                        val type = json.optString("Type", "")
                        val unitName = json.optString("UnitName", "")
                        val lat = json.optDouble("lat", 0.0)
                        val lng = json.optDouble("lng", 0.0)
                        val bearing = json.optDouble("bearing", 0.0)
                        val speed = json.optDouble("speed", 0.0)
                        
                        if (userId.isNotEmpty()) {
                            activeUserIds.put(userId)
                            
                            val safeName = name.replace("'", "\\'")
                            val safeUnitName = unitName.replace("'", "\\'")
                            val js = "if(typeof receiveServerLocation === 'function') { receiveServerLocation('$userId', '$number', '$safeName', '$type', '$safeUnitName', $lat, $lng, $bearing, $speed); }"
                            MainActivity.persistentWebView?.let { webView ->
                                mainHandler.post {
                                    webView.evaluateJavascript(js, null)
                                }
                            }
                        }
                    }

                    val safeActiveUserIds = activeUserIds.toString().replace("'", "\\'")
                    val purgeJs = "if(typeof purgeOfflineServerLocations === 'function') { purgeOfflineServerLocations('$safeActiveUserIds'); }"
                    MainActivity.persistentWebView?.let { webView ->
                        mainHandler.post {
                            webView.evaluateJavascript(purgeJs, null)
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch server locations", e)
            }
        }
    }

    private fun fetchInactiveShipsFromServer() {
        executorService.execute {
            try {
                val url = URL("https://dntservicetruck.co.th/geolocation.json")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 3000
                conn.readTimeout = 3000

                if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                    val downloadedJsonText = conn.inputStream.bufferedReader().use { it.readText() }
                    val jsonObject = JSONObject(downloadedJsonText)
                    val featuresArray = jsonObject.optJSONArray("features") ?: JSONArray()
                    
                    val inactiveNames = JSONArray()

                    for (i in 0 until featuresArray.length()) {
                        val feature = featuresArray.getJSONObject(i)
                        val properties = feature.getJSONObject("properties")
                        val shipName = properties.optString("name", "Unknown")
                        val shipNumber = properties.optString("number", "Unknown")
                        val geometry = feature.getJSONObject("geometry")
                        val coordinates = geometry.getJSONArray("coordinates")
                        val lng = coordinates.getDouble(0)
                        val lat = coordinates.getDouble(1)
                        
                        inactiveNames.put(shipName)

                        val safeShipName = shipName.replace("'", "\\'")
                        val js = "if(typeof receiveInactiveLocation === 'function') { receiveInactiveLocation('$safeShipName', '$shipNumber', $lat, $lng); }"
                        MainActivity.persistentWebView?.let { webView ->
                            mainHandler.post {
                                webView.evaluateJavascript(js, null)
                            }
                        }
                    }
                    
                    val safeInactiveNames = inactiveNames.toString().replace("'", "\\'")
                    val purgeJs = "if(typeof purgeInactiveLocations === 'function') { purgeInactiveLocations('$safeInactiveNames'); }"
                    MainActivity.persistentWebView?.let { webView ->
                        mainHandler.post {
                            webView.evaluateJavascript(purgeJs, null)
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch inactive locations", e)
            }
        }
    }

    override fun onLocationUpdate(location: Location) {
        if (isSimulatedMode) return
        
        val userId = currentUserId
        val number = currentNumber
        val name = currentName

        // DYNAMIC STATUS UPDATE: 
        // Checks the active state flags to ensure the title always accurately reflects what's running.
        val currentStatusTitle = when {
            isBroadcasting -> "Broadcast Active"
            isWebRTCActive -> "Streaming Active"
            else -> "Tracking location..."
        }

        // Update the title with the correct state, and the text with the latest coordinates
        val currentTimeMillis = System.currentTimeMillis()
        if (currentTimeMillis - lastNotificationTime >= 10000) {
            lastNotificationTime = currentTimeMillis
            notificationBuilder?.setContentTitle(currentStatusTitle)
            notificationBuilder?.setContentText("Lat: ${location.latitude}, Lng: ${location.longitude}")
            
            notificationBuilder?.build()?.let { builtNotification ->
                notificationManager?.notify(1, builtNotification)
            }
        }

        val speedInKnots = location.speed * 1.943844f
        val safeName = name.replace("'", "\\'")
        val js = "if(typeof receiveServiceLocation === 'function') { receiveServiceLocation('${userId}', '${number}', '${safeName}', ${location.latitude}, ${location.longitude}, ${location.bearing}, ${speedInKnots}); }"
        MainActivity.persistentWebView?.let { webView ->
            mainHandler.post {
                webView.evaluateJavascript(js, null)
            }
        }

        if (isNetworkAvailable()) {
            sendLocationToServer(location, userId, number, name)
        } else {
            saveLocationToInternalStorage(location, userId, number, name)
        }

        val currentTime = System.currentTimeMillis()
        if (currentTime - lastFetchTime >= 15000) {
            lastFetchTime = currentTime
            
            if (isNetworkAvailable()) {
                fetchLocationFromServer()
                fetchInactiveShipsFromServer()
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun sendLocationToServer(location: Location, userId: String, number: String, name: String) {
        executorService.execute {
            try {
                val url = URL("https://dntservicetruck.co.th/locationservice.php")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                val postData =
                    "UserId=${userId}" +
                    "&Number=${number}" +
                    "&Name=${name}" +
                    "&lat=${location.latitude}" +
                    "&lng=${location.longitude}" +
                    "&bearing=${location.bearing}" +
                    "&speed=${location.speed * 1.943844f}" +
                    "&status=online" +
                    "&timestamp=${System.currentTimeMillis()}"
                conn.outputStream.use { it.write(postData.toByteArray()) }
                Log.d(TAG, "Server response: ${conn.responseCode}")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Send location failed, saving for later", e)
                saveLocationToInternalStorage(location, userId, number, name)
            }
        }
    }

    private fun saveLocationToInternalStorage(location: Location, userId: String, number: String, name: String) {
        synchronized(fileLock) {
            try {
                val file = File(filesDir, OFFLINE_FILE)
                val locationJson = JSONObject().apply {
                    put("UserId", userId)
                    put("Number", number)
                    put("Name", name)
                    put("lat", location.latitude)
                    put("lng", location.longitude)
                    put("bearing", location.bearing)
                    put("speed", location.speed * 1.943844f)
                    put("timestamp", System.currentTimeMillis())
                }
                val jsonArray = JSONArray().apply { put(locationJson) }
                file.writeText(jsonArray.toString())
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save location offline", e)
            }
        }
    }

    private fun syncStoredData() {
        executorService.execute {
            synchronized(fileLock) {
                val file = File(filesDir, OFFLINE_FILE)
                if (!file.exists()) return@execute

                try {
                    val jsonArray = JSONArray(file.readText())
                    if (jsonArray.length() == 0) return@execute

                    Log.d(TAG, "Syncing latest location from ${jsonArray.length()} stored locations...")

                    // Get only the most recent location from the array
                    val lastLocation = jsonArray.getJSONObject(jsonArray.length() - 1)
                    val userId = lastLocation.optString("UserId")
                    val number = lastLocation.optString("Number")
                    val name = lastLocation.optString("Name")
                    val lat = lastLocation.optDouble("lat", 0.0)
                    val lng = lastLocation.optDouble("lng", 0.0)
                    val bearing = lastLocation.optDouble("bearing", 0.0)
                    val speed = lastLocation.optDouble("speed", 0.0)
                    val timestamp = lastLocation.optLong("timestamp", System.currentTimeMillis())

                    val url = URL("https://dntservicetruck.co.th/locationservice.php")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")

                    val postData =
                        "UserId=${userId}" +
                        "&Number=${number}" +
                        "&Name=${name}" +
                        "&lat=${lat}" +
                        "&lng=${lng}" +
                        "&bearing=${bearing}" +
                        "&speed=${speed}" +
                        "&status=online" +
                        "&timestamp=${timestamp}"

                    conn.outputStream.use { it.write(postData.toByteArray()) }

                    if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                        Log.d(TAG, "Bulk sync successful")
                        file.delete()
                    } else {
                        Log.e(TAG, "Bulk sync failed: ${conn.responseCode}")
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    Log.e(TAG, "Error during sync", e)
                }
            }
        }
    }
}