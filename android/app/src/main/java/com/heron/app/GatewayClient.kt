package com.heron.app

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private const val TAG = "HeronVoice"

/**
 * Client for Heron gateway's own WebSocket protocol (see
 * packages/gateway/src/server.ts for the authoritative definition):
 *   -> {type:"auth", token}                          (first message)
 *   <- {type:"auth_ok"} | {type:"error", message}
 *   -> {type:"message", text}
 *   <- {type:"tool_call", tool}                       (zero or more, informational)
 *   <- {type:"confirm_request", description, tool, arguments}  (zero or more, action-tier only —
 *                                                              `description` is the human-readable
 *                                                              summary to show, not tool/arguments)
 *   -> {type:"confirm_response", approved}            (reply to each confirm_request)
 *   <- {type:"response", text}                        (final reply for this message)
 */
interface GatewayListener {
    fun onAuthOk()
    fun onToolCall(tool: String)
    fun onConfirmRequest(description: String, respond: (Boolean) -> Unit)
    fun onResponse(text: String)
    fun onError(message: String)
    fun onDisconnected()
}

class GatewayClient(
    private val hostPort: String,
    private val token: String,
    private val listener: GatewayListener,
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // long-lived socket, no read timeout
        .build()
    private var webSocket: WebSocket? = null

    fun connect() {
        val request = Request.Builder().url("ws://$hostPort").build()
        webSocket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.d(TAG, "WS onOpen")
                    webSocket.send(JSONObject().put("type", "auth").put("token", token).toString())
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    Log.d(TAG, "WS onMessage: $text")
                    handleMessage(text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.d(TAG, "WS onFailure: ${t.message}", t)
                    listener.onError(t.message ?: "Connection failed")
                    listener.onDisconnected()
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.d(TAG, "WS onClosed: code=$code reason=$reason")
                    listener.onDisconnected()
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    Log.d(TAG, "WS onClosing: code=$code reason=$reason")
                }
            },
        )
    }

    private fun handleMessage(text: String) {
        val json = JSONObject(text)
        when (json.optString("type")) {
            "auth_ok" -> listener.onAuthOk()
            "tool_call" -> listener.onToolCall(json.optString("tool"))
            "confirm_request" -> {
                val description = json.optString("description")
                listener.onConfirmRequest(description) { approved ->
                    webSocket?.send(JSONObject().put("type", "confirm_response").put("approved", approved).toString())
                }
            }
            "response" -> listener.onResponse(json.optString("text"))
            "error" -> listener.onError(json.optString("message"))
        }
    }

    fun sendMessage(text: String) {
        val sent = webSocket?.send(JSONObject().put("type", "message").put("text", text).toString())
        Log.d(TAG, "sendMessage text=$text webSocket=$webSocket sent=$sent")
    }

    fun close() {
        webSocket?.close(1000, "closing")
        webSocket = null
    }
}
