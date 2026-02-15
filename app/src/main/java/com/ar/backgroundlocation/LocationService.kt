package com.ar.backgroundlocation

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
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

class LocationService : Service(), LocationUpdatesCallBack {
    private lateinit var gpsLocationClient: GPSLocationClient
    private var notification: NotificationCompat.Builder? = null
    private var notificationManager: NotificationManager? = null
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private var currentUserId: String = "0"
    private val fileLock = Any()

    private val handler = Handler(Looper.getMainLooper())
    private val locationPollRunnable = object : Runnable {
        override fun run() {
            fetchLocationFromServer()
            handler.postDelayed(this, 10000) // Poll every 10 seconds
        }
    }

    companion object {
        private const val TAG = "LocationServer"
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_SERVICE_START = "ACTION_START"
        const val ACTION_SERVICE_STOP = "ACTION_STOP"
        private const val PREFS_NAME = "LocationServicePrefs"
        private const val KEY_USER_ID = "saved_user_id"
    }

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        gpsLocationClient = GPSLocationClient()
        gpsLocationClient.setLocationUpdatesCallBack(this)
        val prefs: SharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        currentUserId = prefs.getString(KEY_USER_ID, "0") ?: "0"
        setupNetworkMonitor()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val userId = intent?.getStringExtra("USER_ID")
        if (userId != null) {
            currentUserId = userId
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit { putString(KEY_USER_ID, userId) }
        }

        when (intent?.action) {
            ACTION_START, ACTION_SERVICE_START -> startTracking()
            ACTION_STOP, ACTION_SERVICE_STOP -> stopTracking()
        }
        return START_STICKY
    }

    override fun onBind(p0: Intent?): IBinder? {
        return null
    }

    private fun startTracking() {
        gpsLocationClient.getLocationUpdates(applicationContext)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "location",
                "Location",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager?.createNotificationChannel(channel)
        }
        notification = NotificationCompat.Builder(this, "location")
            .setContentTitle("Tracking location...")
            .setContentText("Searching...")
            .setSmallIcon(R.drawable.ic_launcher_background)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOngoing(true)

        startForeground(1, notification?.build())
        
        handler.removeCallbacks(locationPollRunnable)
        handler.post(locationPollRunnable)
    }

    private fun stopTracking() {
        gpsLocationClient.setLocationUpdatesCallBack(null)
        handler.removeCallbacks(locationPollRunnable)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun locationException(message: String) {
        Log.d(TAG, message)
    }

    private fun setupNetworkMonitor() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.d(TAG, "Network available")
                syncStoredData()
            }
        }
        networkCallback?.let { connectivityManager.registerNetworkCallback(request, it) }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(locationPollRunnable)
        networkCallback?.let {
            connectivityManager.unregisterNetworkCallback(it)
        }
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
                    val text = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(text)
                    val userId = json.optString("UserId", "")
                    val lat = json.optDouble("lat", 0.0)
                    val lng = json.optDouble("lng", 0.0)
                    val bearing = json.optDouble("bearing", 0.0)
                    val speed = json.optDouble("speed", 0.0)

                    val js = "receiveServerLocation('$userId', $lat, $lng, $bearing, $speed)"
                    MainActivity.webViewRef?.get()?.let { webView ->
                        webView.post {
                            webView.evaluateJavascript(js, null)
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching location from server", e)
            }
        }.start()
    }

    private fun saveLocationToLocalFile(location: Location, userId: String) {
        Thread {
            synchronized(fileLock) { 
                try {
                    val fileName = "location_history.json"
                    val file = File(applicationContext.filesDir, fileName)
                    val jsonArray: JSONArray               
                    if (file.exists()) {
                        val content = file.readText()
                        jsonArray = if (content.isNotEmpty()) {
                            JSONArray(content)
                        } else {
                            JSONArray()
                        }
                    } else {
                        jsonArray = JSONArray()
                    }

                    val jsonObject = JSONObject()
                    jsonObject.put("UserId", userId)
                    jsonObject.put("latitude", location.latitude)
                    jsonObject.put("longitude", location.longitude)
                    jsonObject.put("bearing", location.bearing)
                    jsonObject.put("speed", location.speed)
                    jsonObject.put("timestamp", System.currentTimeMillis())
                    
                    jsonArray.put(jsonObject)
                    file.writeText(jsonArray.toString())
                    
                    Log.d(TAG, "Saved location to local file. Total count: ${jsonArray.length()}")
                } catch (e: Exception) {
                    Log.e(TAG, "Error saving location to local JSON", e)
                }
            }
        }.start()
    }

    private fun syncStoredData() {
        Thread {
            synchronized(fileLock) {
                val fileName = "location_history.json"
                val file = File(applicationContext.filesDir, fileName)
                if (!file.exists()) return@Thread
                try {
                    val content = file.readText()
                    if (content.isEmpty()) return@Thread
                    
                    val jsonArray = JSONArray(content)
                    val unsentLocations = JSONArray()
                    
                    for (i in 0 until jsonArray.length()) {
                        val locationObj = jsonArray.getJSONObject(i)
                        val success = sendSingleLocationSync(locationObj)
                        
                        if (!success) {
                            unsentLocations.put(locationObj)
                        } else {
                            Log.d(TAG, "Synced stored location: ${locationObj.optLong("timestamp")}")
                        }
                    }

                    if (unsentLocations.length() < jsonArray.length() && unsentLocations.length() > 0) {
                        file.writeText(unsentLocations.toString())
                        Log.d(TAG, "Sync complete. Remaining items: ${unsentLocations.length()}")
                    } else if (unsentLocations.length() == 0) {
                        file.delete()
                        Log.d(TAG, "Sync complete. All items sent. File deleted.")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing local data", e)
                }
            }
        }.start()
    }

    private fun sendLocationToServer(location: Location, userId: String) {
        Thread {
            try {
                val url = URL("https://dntservicetruck.co.th/locationservice.php")
                val conn = url.openConnection() as HttpURLConnection   
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                
                val postData =
                    "UserId=${userId}" +
                    "&lat=${location.latitude}" +
                    "&lng=${location.longitude}" +
                    "&bearing=${location.bearing}" +
                    "&speed=${location.speed}" +
                    "&timestamp=${System.currentTimeMillis()}"

                conn.outputStream.use { it.write(postData.toByteArray()) }
                Log.d(TAG, "Server response: ${conn.responseCode}")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Send location failed", e)
            }
        }.start()
    }

    private fun sendSingleLocationSync(json: JSONObject): Boolean {
        try {
            val url = URL("https://dntservicetruck.co.th/locationservice.php")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 5000 
            conn.readTimeout = 5000
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            
            val postData = "UserId=${json.getString("UserId")}" +
                    "&lat=${json.getDouble("latitude")}" +
                    "&lng=${json.getDouble("longitude")}" +
                    "&bearing=${json.optDouble("bearing", 0.0)}" +
                    "&speed=${json.optDouble("speed", 0.0)}" +
                    "&timestamp=${json.optLong("timestamp")}"
            
            conn.outputStream.use { it.write(postData.toByteArray()) }
            
            val responseCode = conn.responseCode
            conn.disconnect()
            return responseCode == 200
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send single location", e)
            return false
        }
    }

    override fun onLocationUpdate(location: Location) {
        val userId = currentUserId
        notificationManager?.notify(101, notification?.setContentText("${userId}: ${location.latitude}, ${location.longitude}")?.build())
        val js = "receiveServiceLocation(${userId}, ${location.latitude}, ${location.longitude}, ${location.bearing}, ${location.speed})"
        
        MainActivity.webViewRef?.get()?.let { webView ->
            webView.post {
                webView.evaluateJavascript(js, null)
            }
        }
        saveLocationToLocalFile(location, userId)
        sendLocationToServer(location, userId)
    }
}
