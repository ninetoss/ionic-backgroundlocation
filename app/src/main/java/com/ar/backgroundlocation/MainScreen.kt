package com.ar.backgroundlocation

import android.annotation.SuppressLint
import android.graphics.Color
import android.view.ViewGroup
import android.widget.FrameLayout
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
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

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen(activity: MainActivity) {
    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                val container = FrameLayout(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
                
                MainActivity.webViewContainer = container

                val webView = MainActivity.persistentWebView ?: WebView(ctx.applicationContext).apply {
                    MainActivity.persistentWebView = this
                    addJavascriptInterface(activity.getAndroidInterface(), "Android")
                    
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        cacheMode = WebSettings.LOAD_NO_CACHE
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        mediaPlaybackRequiresUserGesture = false
                    }
                    
                    webChromeClient = object : WebChromeClient() {
                        override fun onPermissionRequest(request: PermissionRequest?) {
                            request?.grant(request.resources)
                        }
                    }

                    webViewClient = object : WebViewClient() {
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
                                    val inputStream = ctx.assets.open(assetPath)
                                    return WebResourceResponse(mimeType, "UTF-8", inputStream)
                                } catch (e: Exception) {
                                }
                            }
                            return super.shouldInterceptRequest(view, request)
                        }
                    }

                    val prefs = ctx.getSharedPreferences("LocationAppPrefs", android.content.Context.MODE_PRIVATE)
                    val savedUserId = prefs.getString("USER_ID", null)
                    if (savedUserId != null) {
                        val savedRole = prefs.getString("USER_ROLE", "sender") ?: "sender"
                        val savedUsername = prefs.getString("USERNAME", "") ?: ""
                        val savedName = prefs.getString("NAME", "") ?: ""
                        val savedNumber = prefs.getString("NUMBER", "") ?: ""
                        
                        activity.getAndroidInterface().onLoginSuccess(
                            savedUserId, savedRole, savedUsername, savedName, savedNumber, ""
                        )
                    } else {
                        try {
                            val inputStream = ctx.assets.open("login.html")
                            val size = inputStream.available()
                            val buffer = ByteArray(size)
                            inputStream.read(buffer)
                            inputStream.close()
                            val htmlContent = String(buffer)
                            loadDataWithBaseURL("https://dntservicetruck.co.th/", htmlContent, "text/html", "UTF-8", null)
                        } catch (e: Exception) {
                            loadUrl("file:///android_asset/login.html")
                        }
                    }
                }
                
                try {
                    val wm = ctx.getSystemService(android.content.Context.WINDOW_SERVICE) as android.view.WindowManager
                    wm.removeViewImmediate(webView)
                } catch (e: Exception) {}
                (webView.parent as? ViewGroup)?.removeView(webView)
                
                container.addView(webView)
                container 
            },
            modifier = Modifier.fillMaxSize(),
            update = { container ->
                val webView = MainActivity.persistentWebView
                if (webView != null && webView.parent != container) {
                    (webView.parent as? ViewGroup)?.removeView(webView)
                    webView.layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    container.addView(webView)
                    
                    webView.requestLayout()
                    webView.invalidate()
                }
                
                webView?.resumeTimers()
                webView?.onResume()
            }
        )
    }
}