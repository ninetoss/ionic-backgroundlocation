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

    private var currentUserId: String = "0"
    private var currentNumber: String = "0"

    private var isTracking = false 
    private var lastFetchTime: Long = 0
    private var lastWfsFetchTime: Long = 0

    override fun onCreate() {
        super.onCreate()
        gpsLocationClient = GPSLocationClient(this)
        gpsLocationClient.setLocationUpdatesCallBack(this)

        setupNetworkMonitor()
        fetchInactiveShipsFromServer()
        
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        currentUserId = prefs.getString(KEY_USER_ID, "0") ?: "0"
        currentNumber = prefs.getString(KEY_NUMBER, "0") ?: "0"
        
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
        when (intent?.action) {
            ACTION_START -> startService()
            ACTION_STOP -> stopService()
        }
        return START_STICKY
    }

    override fun onBind(p0: Intent?): IBinder? {
        return null
    }

    companion object {
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        private const val PREFS_NAME = "LocationPrefs"
        private const val KEY_USER_ID = "UserId"
        private const val KEY_NUMBER = "Number"
        private const val OFFLINE_FILE = "offline_locations.json"
    }

    private fun startService() {
        if (isTracking) return
        isTracking = true
        
        gpsLocationClient.startLocationUpdates()
        sendStatusToServer("online")
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "location",
                "Location",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager?.createNotificationChannel(channel)
        }

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

        val builder = NotificationCompat.Builder(this, "location")
            .setContentTitle("Tracking location...")
            .setContentText("Searching...")
            .setSmallIcon(R.drawable.ic_launcher_background)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            
        notificationBuilder = builder
        val notification = builder.build()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(1, notification)
        }
    }

    private fun stopService() {
        if (!isTracking) return
        isTracking = false
        
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

        Thread {
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
        }.start()
    }

    private fun fetchLocationFromServer() {
        Thread {
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
                            
                            val js = "receiveServerLocation('$userId', '$number', '$name', '$type', '$unitName', $lat, $lng, $bearing, $speed);"
                            MainActivity.persistentWebView?.let { webView ->
                                mainHandler.post {
                                    webView.evaluateJavascript(js, null)
                                }
                            }
                        }
                    }

                    val purgeJs = "if(typeof purgeOfflineServerLocations === 'function') { purgeOfflineServerLocations('${activeUserIds}'); }"
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
        }.start()
    }

    private fun fetchInactiveShipsFromServer() {
        Thread {
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
                    
                    // --- NEW: Track who is currently offline ---
                    val inactiveNames = JSONArray()
                    // -------------------------------------------

                    for (i in 0 until featuresArray.length()) {
                        val feature = featuresArray.getJSONObject(i)
                        val properties = feature.getJSONObject("properties")
                        val shipName = properties.optString("name", "Unknown")
                        val shipNumber = properties.optString("number", "Unknown")
                        val geometry = feature.getJSONObject("geometry")
                        val coordinates = geometry.getJSONArray("coordinates")
                        val lng = coordinates.getDouble(0)
                        val lat = coordinates.getDouble(1)
                        
                        // Add to our list
                        inactiveNames.put(shipName)

                        val js = "receiveInactiveLocation('$shipName', '$shipNumber', $lat, $lng);"
                        MainActivity.persistentWebView?.let { webView ->
                            mainHandler.post {
                                webView.evaluateJavascript(js, null)
                            }
                        }
                    }
                    
                    // --- NEW: Send the offline list to the map for Garbage Collection ---
                    val purgeJs = "if(typeof purgeInactiveLocations === 'function') { purgeInactiveLocations('${inactiveNames.toString()}'); }"
                    MainActivity.persistentWebView?.let { webView ->
                        mainHandler.post {
                            webView.evaluateJavascript(purgeJs, null)
                        }
                    }
                    // --------------------------------------------------------------------
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch inactive locations", e)
            }
        }.start()
    }

    override fun onLocationUpdate(location: Location) {
        val userId = currentUserId
        val number = currentNumber

        notificationBuilder?.setContentText("${userId}: ${location.latitude}, ${location.longitude}")?.build()?.let { builtNotification ->
            notificationManager?.notify(1, builtNotification)
        }

        val js = "receiveServiceLocation('${userId}', '${number}', ${location.latitude}, ${location.longitude}, ${location.bearing}, ${location.speed})"
        MainActivity.persistentWebView?.let { webView ->
            mainHandler.post {
                webView.evaluateJavascript(js, null)
            }
        }

        if (isNetworkAvailable()) {
            sendLocationToServer(location, userId, number)
        } else {
            saveLocationToInternalStorage(location, userId, number)
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

    private fun sendLocationToServer(location: Location, userId: String, number: String) {
        Thread {
            try {
                val url = URL("https://dntservicetruck.co.th/locationservice.php")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                val postData =
                    "UserId=${userId}" +
                    "&Number=${number}" +
                    "&lat=${location.latitude}" +
                    "&lng=${location.longitude}" +
                    "&bearing=${location.bearing}" +
                    "&speed=${location.speed}" +
                    "&status=online" +
                    "&timestamp=${System.currentTimeMillis()}"
                conn.outputStream.use { it.write(postData.toByteArray()) }
                Log.d(TAG, "Server response: ${conn.responseCode}")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Send location failed, saving for later", e)
                saveLocationToInternalStorage(location, userId, number)
            }
        }.start()
    }

    private fun saveLocationToInternalStorage(location: Location, userId: String, number: String) {
        synchronized(fileLock) {
            try {
                val file = File(filesDir, OFFLINE_FILE)
                val jsonArray = if (file.exists()) {
                    JSONArray(file.readText())
                } else {
                    JSONArray()
                }

                val locationJson = JSONObject().apply {
                    put("UserId", userId)
                    put("Number", number)
                    put("lat", location.latitude)
                    put("lng", location.longitude)
                    put("bearing", location.bearing)
                    put("speed", location.speed)
                    put("timestamp", System.currentTimeMillis())
                }
                jsonArray.put(locationJson)
                file.writeText(jsonArray.toString())
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save location offline", e)
            }
        }
    }

    private fun syncStoredData() {
        Thread {
            synchronized(fileLock) {
                val file = File(filesDir, OFFLINE_FILE)
                if (!file.exists()) return@Thread

                try {
                    val jsonArray = JSONArray(file.readText())
                    if (jsonArray.length() == 0) return@Thread

                    Log.d(TAG, "Syncing ${jsonArray.length()} stored locations...")

                    val url = URL("https://dntservicetruck.co.th/locationservice.php")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")

                    conn.outputStream.use { it.write(jsonArray.toString().toByteArray()) }

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
        }.start()
    }
}
