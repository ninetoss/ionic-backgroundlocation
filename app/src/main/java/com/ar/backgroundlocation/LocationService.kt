package com.ar.backgroundlocation

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class LocationService : Service(), LocationUpdatesCallBack {

    private val TAG = "LocationService"
    private lateinit var gpsLocationClient: GPSLocationClient
    private var notification: NotificationCompat.Builder? = null
    private var notificationManager: NotificationManager? = null

    // Network Monitoring
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    
    // Lock object for thread safety
    private val fileLock = Any()

    override fun onCreate() {
        super.onCreate()
        gpsLocationClient = GPSLocationClient()
        gpsLocationClient.setLocationUpdatesCallBack(this)

        setupNetworkMonitor()
    }

    // 1. NETWORK MONITOR
    private fun setupNetworkMonitor() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
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
        super.onDestroy()
        networkCallback?.let {
            connectivityManager.unregisterNetworkCallback(it)
        }
    }

    // 2. SYNC FUNCTION (Reads file -> Sends to Server)
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
                        
                        // Try to send (Synchronous blocking call)
                        val success = sendSingleLocationSync(locationObj)
                        
                        if (!success) {
                            unsentLocations.put(locationObj)
                        } else {
                            Log.d(TAG, "Synced stored location: ${locationObj.optLong("timestamp")}")
                        }
                    }

                    // Overwrite file with remaining unsent items
                    if (unsentLocations.length() < jsonArray.length()) {
                        file.writeText(unsentLocations.toString())
                        Log.d(TAG, "Sync complete. Remaining items: ${unsentLocations.length()}")
                    } else if (unsentLocations.length() == 0) {
                        // Optional: Delete file if empty to save space
                        file.delete()
                    }

                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing local data", e)
                }
            }
        }.start()
    }

    // 3. LOCATION UPDATE
    override fun onLocationUpdate(location: Location) {
        val updatedNotification = notification?.setContentText(
            "Location: (${location.latitude}, ${location.longitude})"
        )
        notificationManager?.notify(1, updatedNotification?.build())

        // --- STEP A: Send to server (Standard) ---
        sendLocationToServer(location)

        // --- STEP B: Save to local file (Fixed) ---
        saveLocationToLocalFile(location) 
        // ------------------------------------------

        val js = "receiveAndroidLocation(${location.latitude}, ${location.longitude}, ${location.bearing}, ${location.speed})"

        MainActivity.webViewRef?.get()?.let { wv ->
            wv.post {
                wv.evaluateJavascript(js, null)
            }
        }
    }

    // 4. SAVE TO FILE (The missing logic is fixed here)
    private fun saveLocationToLocalFile(location: Location) {
        Thread {
            synchronized(fileLock) { 
                try {
                    val fileName = "location_history.json"
                    val file = File(applicationContext.filesDir, fileName)

                    val jsonArray: JSONArray

                    // Read existing
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

                    // Create object
                    val jsonObject = JSONObject()
                    jsonObject.put("latitude", location.latitude)
                    jsonObject.put("longitude", location.longitude)
                    jsonObject.put("bearing", location.bearing)
                    jsonObject.put("speed", location.speed)
                    jsonObject.put("timestamp", System.currentTimeMillis())

                    // Append and Save
                    jsonArray.put(jsonObject)
                    file.writeText(jsonArray.toString())
                    
                    Log.d(TAG, "Saved location to local file. Total count: ${jsonArray.length()}")

                } catch (e: Exception) {
                    Log.e(TAG, "Error saving location to local JSON", e)
                }
            }
        }.start()
    }

    // 5. SENDING HELPERS
    private fun sendLocationToServer(location: Location) {
        Thread {
            try {
                val url = java.net.URL("https://dntservicetruck.co.th/locationservice.php")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                
                val postData = "lat=${location.latitude}" +
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
            val url = java.net.URL("https://dntservicetruck.co.th/locationservice.php")
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 5000 
            conn.readTimeout = 5000
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")

            val postData = "lat=${json.getDouble("latitude")}" +
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

    // Standard Service Methods
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SERVICE_START -> startService()
            ACTION_SERVICE_STOP -> stopService()
        }
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onBind(p0: Intent?): IBinder? = null

    companion object {
        const val ACTION_SERVICE_START = "ACTION_START"
        const val ACTION_SERVICE_STOP = "ACTION_STOP"
    }

    private fun startService() {
        gpsLocationClient.getLocationUpdates(applicationContext)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "location", "Location", NotificationManager.IMPORTANCE_DEFAULT
            )
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
        notification = NotificationCompat.Builder(this, "location")
            .setContentTitle("Tracking location...")
            .setContentText("Searching...")
            .setSmallIcon(R.drawable.ic_launcher_background)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOngoing(true)
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        startForeground(1, notification?.build())
    }

    private fun stopService() {
        gpsLocationClient.setLocationUpdatesCallBack(null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
        stopSelf()
    }

    override fun locationException(message: String) {
        Log.d(TAG, message)
    }
}