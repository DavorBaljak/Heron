package com.heron.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.view.LayoutInflater
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.Locale

class MainActivity : AppCompatActivity(), GatewayListener {

    companion object {
        private const val TAG = "HeronVoice"
    }

    private enum class ListenMode { TAP, WAKE_WORD, FOLLOW_UP }

    private lateinit var settings: SettingsStore
    private lateinit var statusText: TextView
    private lateinit var transcriptText: TextView
    private lateinit var transcriptScroll: android.widget.ScrollView
    private lateinit var micButton: android.widget.ImageView
    private var micButtonPulse: android.animation.ObjectAnimator? = null

    private var gateway: GatewayClient? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null

    private var alwaysListening = false
    private var ttsSpeaking = false
    private var currentListenMode = ListenMode.TAP
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    /** While System.currentTimeMillis() < this, TAP/FOLLOW_UP keep retrying instead of giving
     * up — a real 5-second window to actually say something, regardless of how eagerly the
     * recognizer's own (unreliable) silence-detection times out mid-pause. */
    private var listenDeadlineMs = 0L
    private val listenWindowMs = 5000L
    /** Set from onResponse; if Heron's own reply ends in a question, the mic should
     * come straight back up listening for the answer instead of waiting for the
     * wake word again. */
    private var lastResponseWasQuestion = false

    private val requestAudioPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Toast.makeText(this, "Microphone permission is required to talk to Heron.", Toast.LENGTH_LONG).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // API 35+ draws edge-to-edge by default (content extends under system bars),
        // so pad the root manually instead of relying on android:fitsSystemWindows.
        val root = findViewById<android.view.View>(R.id.rootLayout)
        val basePadding = root.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(view.paddingLeft, bars.top, view.paddingRight, bars.bottom + basePadding)
            insets
        }

        val buildTime = java.text.SimpleDateFormat("MM-dd HH:mm:ss", Locale.getDefault()).format(java.util.Date(BuildConfig.BUILD_TIME_MILLIS))
        findViewById<TextView>(R.id.versionText).text = "v${BuildConfig.VERSION_NAME} · built $buildTime"

        settings = SettingsStore(this)
        statusText = findViewById(R.id.statusText)
        transcriptText = findViewById(R.id.transcriptText)
        transcriptScroll = findViewById(R.id.transcriptScroll)
        micButton = findViewById(R.id.micButton)

        findViewById<android.widget.Button>(R.id.settingsButton).setOnClickListener { showSettingsDialog() }
        micButton.setOnClickListener { onMicTapped() }

        tts = TextToSpeech(this) { }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                ttsSpeaking = true
            }
            override fun onDone(utteranceId: String?) {
                ttsSpeaking = false
                runOnUiThread {
                    if (lastResponseWasQuestion) {
                        listenDeadlineMs = System.currentTimeMillis() + listenWindowMs
                        startListening(ListenMode.FOLLOW_UP)
                    } else if (alwaysListening) {
                        startListening(ListenMode.WAKE_WORD)
                    }
                }
            }
            override fun onError(utteranceId: String?) {
                ttsSpeaking = false
            }
        })

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestAudioPermission.launch(Manifest.permission.RECORD_AUDIO)
        }

        if (settings.isConfigured()) {
            connectToGateway()
        } else {
            statusText.text = "Not configured"
            showSettingsDialog()
        }
    }

    private val languageOptions = listOf(
        "English" to "en-US",
        "Hrvatski" to "hr-HR",
        "Deutsch" to "de-DE",
        "Français" to "fr-FR",
        "Italiano" to "it-IT",
    )

    private fun showSettingsDialog() {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_settings, null)
        val hostInput = view.findViewById<EditText>(R.id.hostInput)
        val tokenInput = view.findViewById<EditText>(R.id.tokenInput)
        val languageSpinner = view.findViewById<android.widget.Spinner>(R.id.languageSpinner)
        hostInput.setText(settings.gatewayHost ?: "")
        tokenInput.setText(settings.pairingToken ?: "")
        languageSpinner.adapter = android.widget.ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            languageOptions.map { it.first },
        )
        val currentTag = settings.spokenLanguageTag
        val currentIndex = languageOptions.indexOfFirst { it.second == currentTag }.let { if (it < 0) 0 else it }
        languageSpinner.setSelection(currentIndex)

        AlertDialog.Builder(this)
            .setTitle("Gateway connection")
            .setView(view)
            .setPositiveButton("Save") { _, _ ->
                settings.gatewayHost = hostInput.text.toString().trim()
                settings.pairingToken = tokenInput.text.toString().trim()
                settings.spokenLanguageTag = languageOptions[languageSpinner.selectedItemPosition].second
                if (settings.isConfigured()) {
                    connectToGateway()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun connectToGateway() {
        gateway?.close()
        statusText.text = "Connecting..."
        val client = GatewayClient(settings.gatewayHost!!, settings.pairingToken!!, this)
        gateway = client
        client.connect()
    }

    private fun onMicTapped() {
        if (gateway == null) {
            showSettingsDialog()
            return
        }
        if (!ensureAudioPermission()) return
        listenDeadlineMs = System.currentTimeMillis() + listenWindowMs
        startListening(ListenMode.TAP)
    }

    private fun ensureAudioPermission(): Boolean {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestAudioPermission.launch(Manifest.permission.RECORD_AUDIO)
            return false
        }
        return true
    }

    // "Heron" is an uncommon word — Google's free-form speech model has no idea it's a
    // keyword here and reliably mishears it as a more common similar-sounding name
    // (confirmed in testing: "Heron" transcribed as "Sharon"). Accept the likely misheard
    // variants too rather than requiring an exact, correct transcription of "heron".
    private val wakeWordVariants = listOf("heron", "sharon", "karen", "aaron", "erin")

    private fun findWakeWord(lowerText: String): String? = wakeWordVariants.firstOrNull { lowerText.contains(it) }

    /** Strips "hey/hi/yo/ok <wake word>[, my man]" style lead-ins, returning whatever follows. */
    private fun stripWakeWord(text: String): String {
        val lower = text.lowercase(Locale.getDefault())
        val matched = findWakeWord(lower) ?: return ""
        val index = lower.indexOf(matched)
        var rest = text.substring(index + matched.length)
        rest = rest.trimStart(',', '.', '!', '?', ' ')
        rest = rest.replace(Regex("^(my man|buddy|pal)[,.!]?\\s*", RegexOption.IGNORE_CASE), "")
        return rest.trim()
    }

    private fun startListening(mode: ListenMode) {
        Log.d(TAG, "startListening mode=$mode")
        currentListenMode = mode
        speechRecognizer?.destroy()
        val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer = recognizer

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "onReadyForSpeech mode=$currentListenMode")
                // No status-text change here — the animated logo (showListeningIndicator)
                // is the "I'm listening" signal now.
                showListeningIndicator()
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                Log.d(TAG, "onResults mode=$currentListenMode matches=$matches")
                hideListeningIndicator()
                handleRecognized(matches?.firstOrNull())
            }

            override fun onError(error: Int) {
                Log.d(TAG, "onError mode=$currentListenMode error=$error")
                hideListeningIndicator()
                if (currentListenMode == ListenMode.FOLLOW_UP || currentListenMode == ListenMode.TAP) {
                    retryListeningOrGiveUp()
                } else {
                    restartIfAlwaysListening()
                }
            }

            override fun onBeginningOfSpeech() {
                Log.d(TAG, "onBeginningOfSpeech")
            }
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {
                Log.d(TAG, "onEndOfSpeech")
                hideListeningIndicator()
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                Log.d(TAG, "onPartialResults matches=$matches")
            }
        })

        val intent = android.content.Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, settings.spokenLanguageTag)
            // Defaults are short enough that a natural pause after "Heron" (before the
            // actual command) or mid-sentence hesitation gets cut off as silence. All
            // three of these are milliseconds, not seconds.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 15000L)
        }
        recognizer.startListening(intent)
    }

    private fun handleRecognized(text: String?) {
        Log.d(TAG, "handleRecognized mode=$currentListenMode text=$text")
        when (currentListenMode) {
            ListenMode.TAP -> {
                if (!text.isNullOrBlank()) {
                    sendCommand(text)
                } else {
                    retryListeningOrGiveUp()
                }
            }
            ListenMode.WAKE_WORD -> {
                if (text.isNullOrBlank()) {
                    restartIfAlwaysListening()
                    return
                }
                val command = stripWakeWord(text)
                if (command.length > 2) {
                    sendCommand(command)
                    // sendCommand's response will resume WAKE_WORD listening via TTS completion.
                } else if (command.isEmpty() && findWakeWord(text.lowercase(Locale.getDefault())) == null) {
                    // Didn't hear the wake word at all — ignore ambient speech.
                    restartIfAlwaysListening()
                } else {
                    // Heard "Heron" alone — give a real 5s window for the actual command.
                    listenDeadlineMs = System.currentTimeMillis() + listenWindowMs
                    mainHandler.postDelayed({ startListening(ListenMode.FOLLOW_UP) }, 400)
                }
            }
            ListenMode.FOLLOW_UP -> {
                if (!text.isNullOrBlank()) {
                    sendCommand(text)
                } else {
                    retryListeningOrGiveUp()
                }
            }
        }
    }

    /** Called when a TAP or FOLLOW_UP session ends with nothing recognized (error or blank
     * result) — keeps retrying the same mode until listenDeadlineMs, instead of treating the
     * recognizer's own (unreliable) silence cutoff as "the user is done talking". */
    private fun retryListeningOrGiveUp() {
        if (System.currentTimeMillis() < listenDeadlineMs) {
            val mode = currentListenMode
            mainHandler.postDelayed({ startListening(mode) }, 400)
        } else {
            restartIfAlwaysListening()
        }
    }

    /**
     * Restarting SpeechRecognizer synchronously from within its own error
     * callback reliably triggers ERROR_SERVER_DISCONNECTED on the new
     * session (observed: every restart-on-error cycle logged error=7
     * immediately followed by error=11) — the recognizer service needs a
     * beat to tear down first. A short delay avoids it.
     */
    private fun restartIfAlwaysListening() {
        if (alwaysListening && !ttsSpeaking) {
            mainHandler.postDelayed({
                if (alwaysListening && !ttsSpeaking) startListening(ListenMode.WAKE_WORD)
            }, 400)
        } else if (!alwaysListening) {
            statusText.text = if (gateway != null) "Connected" else "Not configured"
        }
    }

    private fun sendCommand(text: String) {
        appendTranscript("You: $text")
        statusText.text = "Connected"
        gateway?.sendMessage(text)
    }

    /** Strips markdown syntax Claude sometimes uses — read aloud literally ("asterisk asterisk") by TTS otherwise. */
    private fun stripMarkdown(text: String): String {
        return text
            .replace(Regex("\\*\\*(.*?)\\*\\*"), "$1")
            .replace(Regex("(?<!\\*)\\*(?!\\*)(.*?)\\*(?!\\*)"), "$1")
            .replace(Regex("`([^`]*)`"), "$1")
            .replace(Regex("^#{1,6}\\s*", RegexOption.MULTILINE), "")
            .replace(Regex("^[-*]\\s+", RegexOption.MULTILINE), "")
    }

    /** Parenthetical asides are almost always a sensor/room/control label
     * ("Entrance Gate (Ulazna kapija)") rather than something worth saying out
     * loud — strip them for TTS only, the transcript keeps the full text. */
    private fun stripParentheticals(text: String): String {
        return text.replace(Regex("\\s*\\([^)]*\\)"), "").replace(Regex(" {2,}"), " ").trim()
    }

    /** Swaps the logo's baked-in static waveform for animated bars in the same spot,
     * so the logo itself visibly "listens" instead of a plain status-text change. */
    /** The listen button's own art has a baked-in mic/waveform, but it's a
     * full-width responsive image rather than a fixed size, so precisely
     * overlaying animated bars on the mic capsule (like the launcher-icon
     * logo used to) isn't reliable across screen widths. Pulsing the whole
     * button instead is simple and scales with any width. */
    private fun showListeningIndicator() {
        runOnUiThread {
            micButtonPulse?.cancel()
            micButtonPulse = android.animation.ObjectAnimator.ofFloat(micButton, "alpha", 1f, 0.55f).apply {
                duration = 450L
                repeatMode = android.animation.ValueAnimator.REVERSE
                repeatCount = android.animation.ValueAnimator.INFINITE
            }
            micButtonPulse?.start()
        }
    }

    private fun hideListeningIndicator() {
        runOnUiThread {
            micButtonPulse?.cancel()
            micButtonPulse = null
            micButton.alpha = 1f
        }
    }

    private fun appendTranscript(line: String) {
        runOnUiThread {
            transcriptText.append("\n\n$line")
            transcriptScroll.post { transcriptScroll.fullScroll(android.view.View.FOCUS_DOWN) }
        }
    }

    // --- GatewayListener (callbacks arrive on OkHttp's background thread) ---

    override fun onAuthOk() {
        runOnUiThread { statusText.text = "Connected" }
    }

    override fun onToolCall(tool: String) {
        appendTranscript("  [checking $tool]")
    }

    override fun onConfirmRequest(description: String, respond: (Boolean) -> Unit) {
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Confirm action")
                .setMessage(description)
                .setCancelable(false)
                .setPositiveButton("Yes") { _, _ -> respond(true) }
                .setNegativeButton("No") { _, _ -> respond(false) }
                .show()
        }
    }

    override fun onResponse(text: String) {
        val clean = stripMarkdown(text)
        appendTranscript("Heron: $clean")
        lastResponseWasQuestion = clean.trim().endsWith("?")
        val result = tts?.setLanguage(Locale.forLanguageTag(settings.spokenLanguageTag))
        Log.d(TAG, "tts.setLanguage(${settings.spokenLanguageTag}) result=$result")
        tts?.speak(stripParentheticals(clean), TextToSpeech.QUEUE_FLUSH, null, "heron-response")
    }

    override fun onError(message: String) {
        runOnUiThread {
            statusText.text = "Error"
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
        restartIfAlwaysListening()
    }

    override fun onDisconnected() {
        runOnUiThread { statusText.text = "Disconnected" }
    }

    override fun onDestroy() {
        super.onDestroy()
        gateway?.close()
        speechRecognizer?.destroy()
        tts?.shutdown()
    }
}
