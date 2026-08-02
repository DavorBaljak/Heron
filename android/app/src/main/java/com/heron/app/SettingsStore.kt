package com.heron.app

import android.content.Context

/** Gateway address + pairing token, entered once via the settings dialog and remembered locally. */
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("heron_settings", Context.MODE_PRIVATE)

    var gatewayHost: String?
        get() = prefs.getString("gateway_host", null)
        set(value) = prefs.edit().putString("gateway_host", value).apply()

    var pairingToken: String?
        get() = prefs.getString("pairing_token", null)
        set(value) = prefs.edit().putString("pairing_token", value).apply()

    /** BCP-47 tag for STT/TTS, e.g. "en-GB" or "hr-HR". Defaults to the device's own locale. */
    var spokenLanguageTag: String
        get() = prefs.getString("spoken_language_tag", null) ?: java.util.Locale.getDefault().toLanguageTag()
        set(value) = prefs.edit().putString("spoken_language_tag", value).apply()

    fun isConfigured(): Boolean = !gatewayHost.isNullOrBlank() && !pairingToken.isNullOrBlank()
}
