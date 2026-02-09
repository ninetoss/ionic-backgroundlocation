package com.ar.backgroundlocation

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.TextUtils
import android.widget.Toast
import android.graphics.Color
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.pedro.library.view.OpenGlView
import java.lang.ref.WeakReference

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen(activity: MainActivity) {
    Box(modifier = Modifier.fillMaxSize()) {
        
        // 1. Camera Preview (OpenGlView)
        // It is placed FIRST so it renders BEHIND the WebView
        AndroidView(
            factory = { ctx ->
                OpenGlView(ctx).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    // Assign to MainActivity static ref so we can use it there
                    MainActivity.openGlViewRef = this
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // 2. The WebView hosting Leaflet
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    
                    // CRITICAL: Make WebView transparent to see the camera behind it
                    setBackgroundColor(Color.TRANSPARENT)
                    
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.cacheMode = WebSettings.LOAD_NO_CACHE
                    settings.mediaPlaybackRequiresUserGesture = false // Helpful for WebRTC/Video
                    
                    // --- FIX START: Custom WebViewClient to intercept fake domain requests ---
                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                            val url = request?.url?.toString() ?: return null
                            
                            // "https://www.example.com" acts as the valid Origin for YouTube
                            if (url.startsWith("https://www.example.com/")) {
                                try {
                                    // Remove the fake domain to get the asset path
                                    // e.g. https://www.example.com/assets/icon.svg -> assets/icon.svg
                                    val assetPath = url.replace("https://www.example.com/", "")
                                    
                                    // Determine mime type to ensure browser handles files correctly
                                    val mimeType = when {
                                        assetPath.endsWith(".html") -> "text/html"
                                        assetPath.endsWith(".js") -> "text/javascript"
                                        assetPath.endsWith(".css") -> "text/css"
                                        assetPath.endsWith(".svg") -> "image/svg+xml"
                                        assetPath.endsWith(".png") -> "image/png"
                                        assetPath.endsWith(".jpg") -> "image/jpeg"
                                        assetPath.endsWith(".gif") -> "image/gif"
                                        else -> "text/plain"
                                    }
                                    
                                    val inputStream = ctx.assets.open(assetPath)
                                    return WebResourceResponse(mimeType, "UTF-8", inputStream)
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }
                            return super.shouldInterceptRequest(view, request)
                        }
                    }
                    // --- FIX END ---
                    
                    // Register the updated Interface from MainActivity
                    addJavascriptInterface(activity.getAndroidInterface(), "Android")
                    
                    // Also register the WebAppInterface if needed
                    // addJavascriptInterface(WebAppInterface(ctx), \"Android\") 

                    // Store reference
                    MainActivity.webViewRef = WeakReference(this)
                    
                    // --- FIX START: Load login.html with fake Base URL ---
                    try {
                        val inputStream = ctx.assets.open("login.html")
                        val size = inputStream.available()
                        val buffer = ByteArray(size)
                        inputStream.read(buffer)
                        inputStream.close()
                        val htmlContent = String(buffer)
                        
                        // Load using the fake domain so "Origin" headers are valid for YouTube
                        loadDataWithBaseURL("https://www.example.com/", htmlContent, "text/html", "UTF-8", null)
                    } catch (e: Exception) {
                        // Fallback just in case
                        loadUrl("file:///android_asset/login.html")
                    }
                    // --- FIX END ---
                }
            },
            modifier = Modifier.fillMaxSize()
        )
    }
}

class WebAppInterface(private val context: Context) {
    private var name: String = ""
    private var password: String = ""
    private var role: String = ""
    @JavascriptInterface
    fun startLiveStream(description: String) {
        validateMobileLiveIntent(context, description)
    }

    private fun validateMobileLiveIntent(context: Context, description: String) {
        if (canResolveMobileLiveIntent(context)) {
            startMobileLive(context, description)
        } else {
            Toast.makeText(context, "Please Update your Youtube app.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun canResolveMobileLiveIntent(context: Context): Boolean {
        val intent = Intent("com.google.android.youtube.intent.action.CREATE_LIVE_STREAM")
            .setPackage("com.google.android.youtube")
        val pm = context.packageManager
        val resolveInfo = pm.queryIntentActivities(intent, 0)
        return resolveInfo != null && resolveInfo.isNotEmpty()
    }

    private fun startMobileLive(context: Context, description: String) {
        val intent = Intent("com.google.android.youtube.intent.action.CREATE_LIVE_STREAM")
            .setPackage("com.google.android.youtube")
        
        val referrer = Uri.Builder()
            .scheme("android-app")
            .appendPath(context.packageName)
            .build()
            
        intent.putExtra(Intent.EXTRA_REFERRER, referrer)
        if (!TextUtils.isEmpty(description)) {
            intent.putExtra(Intent.EXTRA_SUBJECT, description)
        }
        context.startActivity(intent)
    }
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
    @JavascriptInterface
    fun onLoginSuccess(userName: String, userPassword: String, role: String) {
        name = userName
        password = userPassword
        // Use the static reference to load the map page on the main thread
        MainActivity.webViewRef?.get()?.let { wv ->
            wv.post {
                if (role == "admin") {
                try {
                    val inputStream = context.assets.open("leaflet_map_admin.html")
                    val size = inputStream.available()
                    val buffer = ByteArray(size)
                    inputStream.read(buffer)
                    inputStream.close()
                    val htmlContent = String(buffer)
                    
                    wv.loadDataWithBaseURL("https://www.example.com/", htmlContent, "text/html", "UTF-8", null)
                } catch (e: Exception) {
                    wv.loadUrl("file:///android_asset/leaflet_map_admin.html")
                }
                } else {
                try {
                    val inputStream = context.assets.open("leaflet_map.html")
                    val size = inputStream.available()
                    val buffer = ByteArray(size)
                    inputStream.read(buffer)
                    inputStream.close()
                    val htmlContent = String(buffer)
                    
                    wv.loadDataWithBaseURL("https://www.example.com/", htmlContent, "text/html", "UTF-8", null)
                } catch (e: Exception) {
                    wv.loadUrl("file:///android_asset/leaflet_map.html")
                }
                }
            }
        }
    }
    @JavascriptInterface
    fun getUserName(): String = name

    @JavascriptInterface
    fun getUserPassword(): String = password
}