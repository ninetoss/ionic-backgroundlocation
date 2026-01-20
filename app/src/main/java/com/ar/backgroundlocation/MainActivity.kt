package com.ar.backgroundlocation
import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
class MainActivity : ComponentActivity() {
    private val tag = MainActivity::class.java.simpleName
    companion object {
        // This static ref allows LocationService to find the active WebView
        @SuppressLint("StaticFieldLeak")
        var webViewRef: WebView? = null
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Load the Compose Screen
        setContent {
            MainScreen()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!hasNotificationPerm()) {
                requestMultiplePermissions.launch(
                    arrayOf(
                        Manifest.permission.POST_NOTIFICATIONS,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    )
                )
            } else {
                checkLocationPerm()
            }
        } else {
            checkLocationPerm()
        }
    }
    private val requestMultiplePermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        permissions.entries.forEach {
            Log.d("DEBUG", "${it.key} = ${it.value}")
            if (it.key == Manifest.permission.POST_NOTIFICATIONS && it.value) {
                checkLocationPerm()
            }
        }
    }
    private val requestLocationPerm = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            askForBGPermission()
        } else {
            Log.d(tag, "Location permission is not granted")
        }
    }
    private val requestBGLocationPerm = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.d(tag, "Background Location permission is granted")
        } else {
            Log.d(tag, "Background Location permission is not granted")
        }
    }
    private fun checkLocationPerm() {
        if (!hasLocationPermission()) {
            requestLocationPerm.launch(
                Manifest.permission.ACCESS_FINE_LOCATION
            )
        } else {
            askForBGPermission()
        }
    }
    private fun askForBGPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (!hasBGLocationPermission()) {
                requestBGLocationPerm.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
        }
    }
}