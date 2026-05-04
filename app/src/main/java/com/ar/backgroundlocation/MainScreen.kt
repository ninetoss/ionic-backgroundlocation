package com.ar.backgroundlocation

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.text.TextUtils
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
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
        // 1. OpenGL View
        AndroidView(
            factory = { ctx ->
                OpenGlView(ctx).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    MainActivity.openGlViewRef = this
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // 2. WebView
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        cacheMode = WebSettings.LOAD_NO_CACHE
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        mediaPlaybackRequiresUserGesture = false
                        allowFileAccess = true
                        allowContentAccess = true
                        allowFileAccessFromFileURLs = true
                        allowUniversalAccessFromFileURLs = true
                    }
                    setBackgroundColor(Color.TRANSPARENT)

                    // Enable debugging
                    WebView.setWebContentsDebuggingEnabled(true)

                    // Bind the interfaces
                    addJavascriptInterface(WebAppInterface(ctx), "AndroidInterface")
                    addJavascriptInterface(activity.getAndroidInterface(), "Android")

                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallback: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?
                        ): Boolean {
                            activity.openFileChooser(filePathCallback)
                            return true
                        }
                    }

                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                            val url = request?.url?.toString() ?: return null
                            if (url.startsWith("https://www.example.com/")) {
                                try {
                                    val assetPath = url.replace("https://www.example.com/", "")
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
                                    val inputStream = ctx.assets.open(assetPath)
                                    return WebResourceResponse(mimeType, "UTF-8", inputStream)
                                } catch (e: Exception) {
                                    // Let it fall through to network if not found in assets, 
                                    // but usually these are local assets
                                }
                            }
                            return super.shouldInterceptRequest(view, request)
                        }
                    }

                    MainActivity.webViewRef = WeakReference(this)

                    try {
                        val inputStream = ctx.assets.open("login.html")
                        val size = inputStream.available()
                        val buffer = ByteArray(size)
                        inputStream.read(buffer)
                        inputStream.close()
                        val htmlContent = String(buffer)
                        loadDataWithBaseURL("https://www.example.com/", htmlContent, "text/html", "UTF-8", null)
                    } catch (e: Exception) {
                        loadUrl("file:///android_asset/login.html")
                    }
                }
            },
            modifier = Modifier.fillMaxSize()
        )
    }
}

class WebAppInterface(private val context: Context) {
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
    fun onLoginSuccess(UserId: String, role: String) {
        MainActivity.webViewRef?.get()?.let { wv ->
            wv.post {
                if (role == "admin") {
                    try {
                        val inputStream = context.assets.open("leaflet_map_server.html")
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
                        val inputStream = context.assets.open("leaflet_map_service.html")
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
}
