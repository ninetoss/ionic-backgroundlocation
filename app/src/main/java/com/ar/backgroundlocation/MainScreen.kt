package com.ar.backgroundlocation

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen() {
    val context = LocalContext.current

    Box(modifier = Modifier.fillMaxSize()) {
        
        // The WebView hosting Leaflet
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.cacheMode = WebSettings.LOAD_NO_CACHE
                    webViewClient = WebViewClient()
                    
                    // Add Javascript Interface to handle start/stop from JS
                    addJavascriptInterface(WebAppInterface(ctx), "Android")

                    // Assign this WebView to the static reference in MainActivity
                    // so LocationService can update it
                    MainActivity.webViewRef = this
                    
                    loadUrl("file:///android_asset/leaflet_map.html")
                }
            },
            modifier = Modifier.fillMaxSize()
        )
    }
}

class WebAppInterface(private val context: Context) {
    @JavascriptInterface
    fun startTracking() {
        val intent = Intent(context, LocationService::class.java)
        intent.action = LocationService.ACTION_SERVICE_START
        context.startForegroundService(intent)
    }

    @JavascriptInterface
    fun stopTracking() {
        val intent = Intent(context, LocationService::class.java)
        intent.action = LocationService.ACTION_SERVICE_STOP
        context.startService(intent)
    }
}
