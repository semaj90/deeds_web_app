# Voice Chat Enhancement Roadmap

**Current Status:** ✅ Phase 1 Complete (TTS + STT Basic Integration)
**Next Phase:** 🚧 Phase 2 (Continuous Conversation Mode)

---

## 📊 Current Implementation Stats

| Metric | Value | Status |
|--------|-------|--------|
| **Lines Added** | +114 to SimpleWorkingChat | ✅ Complete |
| **New Routes** | 2 (voice-chat-demo, tts-demo) | ✅ Complete |
| **Model Size** | 61MB (Piper TTS, cached) | ✅ Complete |
| **TTS Latency** | ~500-1000ms for typical legal text | ✅ Optimized |
| **STT Latency** | <100ms interim, ~500ms final | ✅ Optimized |
| **Browser Support** | TTS: 4/4, STT: 3/4 (no Firefox) | ⚠️ Firefox pending |
| **TypeScript Errors** | 0 errors, 398 warnings | ✅ Clean |

---

## 🎯 Enhancement Phases

### ✅ Phase 1: Core Voice Integration (COMPLETE)
**Status:** Shipped in commit `62a7699e1d`

- [x] Piper TTS integration for AI responses
- [x] Web Speech API for voice input
- [x] Volume buttons on assistant messages
- [x] Microphone button with live transcription
- [x] Interim transcript preview
- [x] Mixed mode (type + speak)
- [x] Browser compatibility detection
- [x] Demo route at `/voice-chat-demo`
- [x] Complete documentation

**Deliverables:**
- SimpleWorkingChat.svelte (355L)
- tts.ts service (161L)
- voice-chat-demo route
- VOICE_CHAT_INTEGRATION.md

---

### 🚧 Phase 2: Continuous Conversation Mode (IN PROGRESS)
**Status:** Implementation starting
**Target:** Hands-free legal consultation experience

#### Features

1. **Toggle Hands-Free Mode**
   - Button in chat header: "🎧 Hands-Free" (off) → "🔴 Live" (on)
   - When enabled:
     - AI auto-speaks responses after generation
     - Auto-starts listening after TTS finishes
     - Creates natural conversation flow
   - Persist preference to localStorage

2. **Voice Activity Detection (VAD)**
   - Detect when user stops speaking (silence threshold)
   - Auto-send message after 2 seconds of silence
   - Visual feedback: "Processing speech..." indicator
   - Configurable silence threshold (1-5 seconds)

3. **Interrupt Handling**
   - Detect when user starts speaking during AI TTS playback
   - Stop AI speech immediately
   - Start listening for user's interruption
   - Queue: User interrupts → Stop TTS → Listen → Send → AI responds

4. **Conversation State Machine**
   ```
   IDLE → User speaks → LISTENING
   LISTENING → Silence detected → PROCESSING
   PROCESSING → Send message → AI_THINKING
   AI_THINKING → Response ready → AI_SPEAKING (if hands-free)
   AI_SPEAKING → TTS finishes → LISTENING (if hands-free)
   AI_SPEAKING → User interrupts → LISTENING
   ```

5. **Visual Indicators**
   - Animated waveform during listening
   - Pulsing "AI Speaking" badge during TTS
   - "Listening for your response..." banner
   - Interrupt hint: "Speak to interrupt"

#### Implementation Plan

**Files to Modify:**
- `SimpleWorkingChat.svelte` (+80L): Add hands-free state machine
- `tts.ts` (+30L): Add interrupt detection + callbacks
- `voice-chat-demo/+page.svelte` (+20L): Add hands-free demo section

**New Components:**
- `VoiceActivityDetector.svelte` (80L): VAD logic + visualization
- `HandsFreeSettings.svelte` (60L): Silence threshold, auto-speak toggle

**Technical Approach:**
```typescript
// Hands-free state machine
type ConversationState = 'idle' | 'listening' | 'processing' | 'ai-thinking' | 'ai-speaking';
let conversationState = $state<ConversationState>('idle');
let handsFreeEnabled = $state(false);

// VAD (Voice Activity Detection)
let silenceTimer: NodeJS.Timeout | null = null;
let silenceThreshold = $state(2000); // 2 seconds

recognition.onresult = (event) => {
  // Reset silence timer on any speech
  clearTimeout(silenceTimer);

  // Set new silence timer
  silenceTimer = setTimeout(() => {
    if (handsFreeEnabled && currentMessage.trim()) {
      sendMessage(); // Auto-send after silence
    }
  }, silenceThreshold);
};

// Auto-speak AI responses in hands-free mode
$effect(() => {
  if (handsFreeEnabled && session?.status === 'idle') {
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg?.role === 'assistant' && conversationState === 'ai-thinking') {
      conversationState = 'ai-speaking';
      speakMessage(lastMsg.content, session.messages.length - 1).then(() => {
        conversationState = 'listening';
        toggleListening(); // Restart listening after TTS
      });
    }
  }
});
```

#### Success Metrics
- [ ] Hands-free toggle persists across sessions
- [ ] VAD accuracy >90% (correctly detects silence)
- [ ] Interrupt latency <200ms (stop TTS quickly)
- [ ] Conversation feels natural (minimal wait between turns)
- [ ] User can exit hands-free mode at any time

#### Testing Checklist
- [ ] Toggle hands-free → AI speaks response → auto-listens
- [ ] Speak during AI TTS → AI stops → captures user speech
- [ ] Silence detection → auto-sends after 2s
- [ ] Adjust silence threshold → VAD respects new value
- [ ] Disable hands-free mid-conversation → stops auto behavior

---

### 📋 Phase 3: Voice Commands (PLANNED)
**Status:** Not started
**Target:** Keyboard-free chat control

#### Features

1. **Command Recognition**
   - Detect commands in user speech: "send message", "clear chat", "stop speaking"
   - Execute immediately (don't send as chat message)
   - Visual confirmation: "✓ Command: Clear Chat"

2. **Supported Commands**
   ```
   "send message" / "send it" → Send current text
   "clear chat" / "new conversation" → Reset chat
   "stop speaking" / "be quiet" → Stop TTS
   "repeat that" / "say that again" → Re-speak last AI message
   "louder" / "quieter" → Adjust TTS volume
   "faster" / "slower" → Adjust TTS speed
   "start listening" / "stop listening" → Toggle STT
   ```

3. **Command Parsing**
   ```typescript
   const commands = [
     { pattern: /^(send|send it|send message)$/i, action: () => sendMessage() },
     { pattern: /^(clear|clear chat|new conversation)$/i, action: () => clearChat() },
     { pattern: /^(stop|be quiet|stop speaking)$/i, action: () => ttsService.stop() },
     { pattern: /^(repeat|say that again|repeat that)$/i, action: () => repeatLast() },
   ];

   recognition.onresult = (event) => {
     const transcript = getFinalTranscript(event);
     const matchedCommand = commands.find(cmd => cmd.pattern.test(transcript));
     if (matchedCommand) {
       matchedCommand.action();
       // Don't append to message box
     } else {
       currentMessage += transcript; // Regular speech
     }
   };
   ```

4. **Confirmation Feedback**
   - Toast notification: "✓ Cleared chat"
   - Audio beep on command execution
   - Visual highlight on affected UI element

#### Implementation Plan
- Modify `SimpleWorkingChat.svelte` (+60L)
- New file: `voice-commands.ts` (100L) — command registry + parser
- Update `voice-chat-demo` with command examples

#### Success Metrics
- [ ] 95% command recognition accuracy
- [ ] <100ms command execution latency
- [ ] Commands don't leak into chat messages
- [ ] Clear visual/audio confirmation

---

### 🌍 Phase 4: Multi-Language Support (PLANNED)
**Status:** Not started
**Target:** International legal practice

#### Features

1. **Language Detection**
   - Auto-detect from `navigator.language`
   - Manual selector in settings panel
   - Persist preference to localStorage

2. **TTS Language Models**
   - Download language-specific Piper models on demand
   - Supported: en-US, es-ES, fr-FR, de-DE, ja-JP
   - Model size: ~60-80MB per language
   - Cache in IndexedDB after first download

3. **STT Language Config**
   - Set `recognition.lang` based on user preference
   - Fallback: `en-US` if unsupported

4. **UI Localization**
   - Translate voice UI strings (interim transcript labels, buttons, etc.)
   - Legal terminology aware (jurisdiction-specific translations)

#### Model URLs
```typescript
const TTS_MODELS = {
  'en-US': '/models/piper-en-us.onnx',
  'es-ES': '/models/piper-es-es.onnx',
  'fr-FR': '/models/piper-fr-fr.onnx',
  'de-DE': '/models/piper-de-de.onnx',
  'ja-JP': '/models/piper-ja-jp.onnx',
};
```

#### Implementation Plan
- Modify `tts.ts` (+50L): Dynamic model loading
- New component: `LanguageSelector.svelte` (80L)
- Download 4 additional Piper models (~240MB total)
- i18n file: `voice-strings.json` (translations)

#### Success Metrics
- [ ] 5 languages supported (en, es, fr, de, ja)
- [ ] Model downloads in <5s on typical connection
- [ ] Language switching doesn't break conversation
- [ ] Legal terms translated accurately

---

### 🎧 Phase 5: Whisper.cpp WASM (PLANNED)
**Status:** Not started
**Target:** Universal browser support + offline STT

#### Why Whisper.cpp?

**Current Limitation:** Web Speech API doesn't work on Firefox (30% of users)

**Whisper.cpp Benefits:**
- ✅ Works in all browsers (Chrome, Firefox, Edge, Safari)
- ✅ Offline-first (no network required)
- ✅ Better accuracy than Web Speech API
- ✅ Supports 99 languages out-of-box
- ✅ Punctuation and capitalization included

**Whisper.cpp Drawbacks:**
- ❌ ~40MB WASM bundle (vs 0MB for Web Speech API)
- ❌ ~100-300MB model (tiny/base/small)
- ❌ Slower cold start (~2-3s model load)
- ❌ Requires AudioContext for mic access

#### Implementation Plan

1. **Install Whisper.cpp WASM**
   ```bash
   npm install whisper-wasm
   ```

2. **Download Model**
   ```bash
   # Whisper tiny.en (75MB) — English only, fast
   wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin

   # OR Whisper base (142MB) — Multilingual, better accuracy
   wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
   ```

3. **Dual STT Strategy**
   ```typescript
   // Feature detection
   const hasWebSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
   const sttBackend = $state<'web-speech' | 'whisper'>(
     hasWebSpeech ? 'web-speech' : 'whisper'
   );

   // Unified STT interface
   async function startListening() {
     if (sttBackend === 'web-speech') {
       recognition.start();
     } else {
       await whisperInstance.startRecording();
     }
   }
   ```

4. **Lazy Loading**
   - Load Whisper WASM only on Firefox or if user opts in
   - Cache model in IndexedDB (persistent across sessions)
   - Show download progress (75MB can take 5-10s)

#### Files to Create
- `src/lib/services/whisper.ts` (200L) — Whisper.cpp wrapper
- `static/models/ggml-tiny.en.bin` (75MB) — Whisper model

#### Files to Modify
- `SimpleWorkingChat.svelte` (+40L) — Dual backend switching
- `tts.ts` (+20L) — Shared AudioContext with Whisper

#### Success Metrics
- [ ] Firefox users can use voice input
- [ ] Model loads in <3s on typical connection
- [ ] Transcription accuracy >95% (better than Web Speech API)
- [ ] Fallback chain: Web Speech → Whisper → Manual typing

---

### 🔧 Phase 6: Advanced Settings Panel (PLANNED)
**Status:** Not started
**Target:** Customizable voice experience

#### Features

1. **TTS Settings**
   - Speed: 0.5x - 2.0x (slider)
   - Volume: 0% - 100% (slider)
   - Voice selection (if multiple Piper voices available)
   - Auto-speak responses toggle

2. **STT Settings**
   - Language selection (dropdown)
   - Silence threshold: 1-5 seconds (slider)
   - Auto-send after silence toggle
   - Backend selection: Web Speech vs Whisper

3. **Conversation Settings**
   - Hands-free mode toggle
   - Interrupt detection toggle
   - Show interim transcripts toggle
   - Voice command recognition toggle

4. **Persistence**
   - Save all settings to localStorage
   - Per-chat settings (override global)
   - Export/import settings JSON

#### UI Design
```svelte
<Dialog.Root>
  <Dialog.Trigger>
    <Button>⚙️ Voice Settings</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Tabs.Root>
      <Tabs.List>
        <Tabs.Trigger>TTS</Tabs.Trigger>
        <Tabs.Trigger>STT</Tabs.Trigger>
        <Tabs.Trigger>Conversation</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="tts">
        <!-- Speed, volume, voice sliders -->
      </Tabs.Content>

      <Tabs.Content value="stt">
        <!-- Language, silence, backend -->
      </Tabs.Content>

      <Tabs.Content value="conversation">
        <!-- Hands-free, interrupts, commands -->
      </Tabs.Content>
    </Tabs.Root>
  </Dialog.Content>
</Dialog.Root>
```

#### Implementation Plan
- New component: `VoiceSettings.svelte` (250L)
- New file: `voice-preferences.ts` (80L) — localStorage wrapper
- Modify `SimpleWorkingChat.svelte` (+30L) — Settings button + integration

---

## 📈 Progress Tracking

| Phase | Status | Lines of Code | Completion | Target Date |
|-------|--------|---------------|------------|-------------|
| **1. Core Integration** | ✅ Complete | +114L | 100% | Feb 28, 2026 |
| **2. Continuous Mode** | 🚧 In Progress | +130L est. | 0% | Mar 1, 2026 |
| **3. Voice Commands** | 📋 Planned | +160L est. | 0% | Mar 3, 2026 |
| **4. Multi-Language** | 📋 Planned | +210L est. | 0% | Mar 7, 2026 |
| **5. Whisper.cpp** | 📋 Planned | +260L est. | 0% | Mar 10, 2026 |
| **6. Settings Panel** | 📋 Planned | +360L est. | 0% | Mar 15, 2026 |

**Total Estimated LOC:** ~1,234 lines across all phases

---

## 🎯 Success Criteria (Final Product)

- [ ] **Browser Support:** Works in Chrome, Firefox, Edge, Safari (100% coverage)
- [ ] **Hands-Free:** Natural conversation flow with <1s latency between turns
- [ ] **Voice Commands:** 10+ commands with >95% recognition accuracy
- [ ] **Multi-Language:** 5+ languages supported (en, es, fr, de, ja)
- [ ] **Offline-First:** Works without internet (Whisper.cpp + Piper WASM)
- [ ] **Settings:** Fully customizable voice experience (speed, volume, language, etc.)
- [ ] **Performance:** TTS <1s, STT <500ms, total conversation latency <2s
- [ ] **Accessibility:** Keyboard shortcuts for all voice controls, screen reader compatible
- [ ] **Documentation:** Complete API docs, usage guides, troubleshooting

---

## 🚀 Quick Start (After Full Implementation)

```svelte
<SimpleWorkingChat
  chatId="legal-consult"
  enableVoice={true}
  handsFree={true}
  autoSpeakResponses={true}
  silenceThreshold={2000}
  voiceCommands={true}
  language="en-US"
  ttsSpeed={1.0}
  ttsVolume={0.8}
/>
```

**User Experience:**
1. User: "What are the key statutes for property transfer?"
2. AI: [Types response] → Auto-speaks via TTS
3. [2s silence] → Auto-listens for next question
4. User: "Repeat that" → AI re-speaks previous response
5. User: "Thank you, clear chat" → Chat resets
6. **Zero clicks required after initial hands-free toggle**

---

## 📚 Resources

- [Web Speech API Spec](https://wicg.github.io/speech-api/)
- [Piper TTS](https://github.com/rhasspy/piper)
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [Voice Activity Detection (VAD)](https://github.com/snakers4/silero-vad)
- [WebRTC VAD](https://webrtc.googlesource.com/src/+/refs/heads/main/common_audio/vad/)
- [Voice UI Design Guide](https://www.nngroup.com/articles/voice-first/)

---

**Last Updated:** February 28, 2026
**Next Review:** March 1, 2026 (after Phase 2 completion)
