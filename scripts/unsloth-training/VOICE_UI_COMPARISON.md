# Terminal Route — Voice UI Comparison

## Before vs After

---

## Header (Top Navigation)

### BEFORE
```
┌─────────────────────────────────────────────────────────────────┐
│ [TERMINAL] [AI CHAT] [CLEAR] [⚙ Settings]                       │
└─────────────────────────────────────────────────────────────────┘
```

### AFTER
```
┌─────────────────────────────────────────────────────────────────┐
│ [🎧 VOICE] [TERMINAL] [AI CHAT] [CLEAR] [⚙ Settings]            │
│ ↑ NEW                                                            │
│ (becomes "🔴 LIVE (LISTENING...)" when hands-free active)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Message Metadata (Assistant Messages)

### BEFORE
```
┌──────────────────────────────────────────────────────────┐
│ 9S ASSISTANT  12:45 PM  [LOCAL]  [📋 Copy]               │
│ └─ Message content here...                               │
└──────────────────────────────────────────────────────────┘
```

### AFTER
```
┌──────────────────────────────────────────────────────────┐
│ 9S ASSISTANT  12:45 PM  [LOCAL]  [📋 Copy] [🔊 Speak]    │
│ └─ Message content here...                      ↑ NEW    │
└──────────────────────────────────────────────────────────┘
```
- Click 🔊 to hear AI response via Piper TTS
- Becomes 🔇 when speaking (click to stop)

---

## Input Area (Footer)

### BEFORE
```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────┐  ┌──────────┐       │
│ │ Ask 9S about your investigation │  │ [SEND ➤] │       │
│ └─────────────────────────────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────┘
```

### AFTER
```
┌─────────────────────────────────────────────────────────┐
│ ┌───┐ ┌─────────────────────────────────┐ ┌──────────┐  │
│ │🎤 │ │ Ask 9S about your investigation │ │ [SEND ➤] │  │
│ └───┘ └─────────────────────────────────┘ └──────────┘  │
│  ↑ NEW                                                   │
│ (red + pulsing when listening)                           │
└─────────────────────────────────────────────────────────┘
```
- Click 🎤 to start voice input
- Microphone pulses red while listening
- Transcript populates textarea
- Disabled in hands-free mode

---

## Settings Panel

### BEFORE
```
┌──────────────────────────────────────────────────────────────────┐
│ ☑ Thinking animation                                             │
│ Typewriter speed [━━━━━━━━━━] 40ms                               │
│ ☑ Auto-scroll                                                    │
│ ☑ Force server (Ollama)                                          │
│ Persona: [Neutral Analyst ▼]                                     │
│ [🗑 Clear chat]                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### AFTER
```
┌──────────────────────────────────────────────────────────────────┐
│ ☑ Thinking animation                                             │
│ Typewriter speed [━━━━━━━━━━] 40ms                               │
│ ☑ Auto-scroll                                                    │
│ ☑ Force server (Ollama)                                          │
│ Persona: [Neutral Analyst ▼]                                     │
│ ─────────────────────────────────────────────────────────────────│
│ ☑ 🔊 Voice enabled                                        ← NEW  │
│ TTS Volume [━━━━━━━━━━] 100%                               ← NEW  │
│ TTS Speed [━━━━━━━━━━] 1.0x                                ← NEW  │
│ ─────────────────────────────────────────────────────────────────│
│ [🗑 Clear chat]                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## User Flow Diagrams

### Standard Voice Input (Manual)
```
┌────────────┐
│ Click 🎤   │
└────┬───────┘
     │
     v
┌────────────────────┐
│ Mic pulses RED     │
│ "Listening..."     │
└────┬───────────────┘
     │
     v
┌────────────────────┐
│ User speaks        │
│ "Explain tort law" │
└────┬───────────────┘
     │
     v
┌────────────────────┐
│ Transcript appears │
│ in textarea        │
└────┬───────────────┘
     │
     v
┌────────────────────┐
│ User clicks SEND   │
│ (or presses Enter) │
└────┬───────────────┘
     │
     v
┌────────────────────┐
│ AI responds        │
│ (typewriter effect)│
└────┬───────────────┘
     │
     v
┌────────────────────┐
│ Click 🔊 to hear   │
│ TTS speaks response│
└────────────────────┘
```

### Hands-Free Mode (Continuous Loop)
```
┌────────────────────┐
│ Click "🎧 VOICE"   │
│ → "🔴 LIVE"        │
└────┬───────────────┘
     │
     v
┌────────────────────┐
│ State: LISTENING   │◄─────────────────┐
│ Mic auto-starts    │                  │
└────┬───────────────┘                  │
     │                                   │
     v                                   │
┌────────────────────┐                  │
│ User speaks        │                  │
└────┬───────────────┘                  │
     │                                   │
     v                                   │
┌────────────────────┐                  │
│ State: PROCESSING  │                  │
│ Transcript parsed  │                  │
└────┬───────────────┘                  │
     │                                   │
     v                                   │
┌────────────────────┐                  │
│ AUTO-SEND          │                  │
│ (no user click)    │                  │
└────┬───────────────┘                  │
     │                                   │
     v                                   │
┌────────────────────┐                  │
│ State: AI ANALYZING│                  │
│ AI responds        │                  │
└────┬───────────────┘                  │
     │                                   │
     v                                   │
┌────────────────────┐                  │
│ State: AI SPEAKING │                  │
│ TTS auto-plays     │                  │
│ (waits for finish) │                  │
└────┬───────────────┘                  │
     │                                   │
     └───────────────────────────────────┘
     (loops back to LISTENING)
```

---

## Voice Commands (Parsed Silently)

When user says these phrases, they execute actions instead of sending as messages:

| User Says | Action | Hands-Free | Manual |
|-----------|--------|------------|--------|
| "send it" | Send current message | ✅ | ✅ |
| "clear chat" | Reset conversation | ✅ | ✅ |
| "stop" | Stop TTS playback | ✅ | ✅ |

---

## State Indicator (Hands-Free Mode)

When hands-free is active, the "🔴 LIVE" button shows current state:

```
🔴 LIVE (IDLE)              → Green dot, ready
🔴 LIVE (LISTENING...)      → Green pulse, mic active
🔴 LIVE (PROCESSING...)     → Yellow, STT parsing
🔴 LIVE (AI ANALYZING...)   → Yellow, LLM working
🔴 LIVE (AI SPEAKING...)    → Amber, TTS playing
```

---

## Theme Consistency

All voice UI elements match the existing YoRHa/9S terminal theme:

- **Colors**:
  - Listening: Emerald green (#10b981)
  - Speaking: Amber (#fbbf24)
  - Active: Red (#ef4444)
  - Border: Stone-600 (#57534e)
  - Background: Panel (#1c1917)

- **Typography**: Monospace font, tracking-wider
- **Icons**: Lucide icon set via UnoCSS `i-lucide-*`
- **Animations**: Pulse on active mic, fade-in on messages

---

## Browser Support Matrix

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| TTS (Piper ONNX) | ✅ | ✅ | ✅ |
| STT (Web Speech) | ✅ | ❌ | ❌ |
| Hands-free mode | ✅ | ❌* | ❌* |
| Voice settings | ✅ | ✅ | ✅ |

*Firefox/Safari require Whisper.cpp integration (next step)

---

## Key Differences from SimpleWorkingChat

| Feature | SimpleWorkingChat | Terminal Route |
|---------|-------------------|----------------|
| Theme | Neutral/modern | YoRHa/9S retro terminal |
| Header toggle | Small, panel-soft bg | Larger, prominent |
| State indicator | Small badge | Inline in button text |
| Colors | Blue/green accent | Emerald/amber YoRHa palette |
| Typography | Sans-serif | Monospace, tracking-wider |
| Settings panel | Collapsible | Part of header settings |

**Both have identical**:
- Voice functionality
- TTS/STT services
- Hands-free logic
- Command patterns
- Performance characteristics

---

🎙️ **All voice features now match between SimpleWorkingChat and Terminal routes!**
