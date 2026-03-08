# Self-Prompting + Emotion-Aware AI + Re-Engagement Pipeline

## Document ID: 3726
## Created: March 7, 2026
## Status: Implemented

---

## Overview

This document describes the complete self-prompting, emotion-aware AI, and user re-engagement pipeline. The system creates a humanistic AI experience by:

1. **Detecting** user emotional state from multiple signals
2. **Adapting** LLM responses based on detected emotions
3. **Self-evaluating** response quality and retrying if needed
4. **Tracking** user activity and engagement patterns
5. **Re-engaging** idle users via multi-channel notifications

---

## Architecture Flow

```
User Input
  │
  ├──→ Text Emotion Analysis (28 emotions, keyword heuristic)
  │      └──→ Dominant emotion + confidence scores
  │
  ├──→ Behavioral Signal Detection (typing speed, deletions, pauses)
  │      └──→ rushed | careful | frustrated | engaged | distracted | idle
  │
  ├──→ Face Emotion Detection (opt-in webcam, 7 emotions)
  │      └──→ happy | sad | angry | fear | surprise | disgust | neutral
  │
  └──→ Composite Mood Calculation
         ├── Face weight: 1.5x (more reliable than text keywords)
         ├── Text weight: 1.0x
         ├── Behavioral weight: 0.3-0.6x
         └── Output: mood (positive/negative/neutral/mixed)
                      intensity (0-1)
                      needsSimplification (bool)
                      needsEncouragement (bool)
                      needsPatience (bool)
                          │
                          ▼
              ┌─────────────────────────┐
              │  Emotion System Prompt   │
              │  (appended to base LLM   │
              │   system prompt)         │
              └──────────┬──────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │  Client Router Decision  │
              │  LOCAL-ONNX / SERVER     │
              └──────────┬──────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │  Server SSE Chat         │
              │  (/api/sse/chat)         │
              │  System prompt includes: │
              │  - Case context          │
              │  - RAG chunks            │
              │  - KAG graph neighbors   │
              │  - Codebase context      │
              │  - Emotion context  ←NEW │
              └──────────┬──────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │  ACE Self-Evaluation     │
              │  (self-prompt.ts)        │
              │  quality < 0.6 → retry   │
              │  Cached in Redis (1hr)   │
              └──────────┬──────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │  Response to User        │
              │  (tone-adapted, emotion- │
              │   aware, self-evaluated) │
              └─────────────────────────┘
```

---

## 1. Emotion Detection Module

**File**: `src/lib/ai/emotion-context.ts` (252 lines)

### 1.1 Text Emotion Analysis (28 emotions)

GoEmotions taxonomy (Google Research, 28 labels):

| Category | Emotions |
|----------|----------|
| Positive | admiration, amusement, approval, caring, curiosity, desire, excitement, gratitude, joy, love, optimism, pride, relief |
| Negative | anger, annoyance, disappointment, disapproval, disgust, embarrassment, fear, grief, nervousness, remorse, sadness |
| Ambiguous | confusion, realization, surprise, neutral |

Current implementation uses keyword heuristic (10 patterns). Future: wire ONNX model for full 28-emotion classification.

**Recommended HuggingFace models for browser ONNX:**
- `Cohee/distilbert-go-emotions-onnx` (67MB, 28 emotions, q8)
- `llmware/slim-sentiment-onnx` (<30MB, 3 classes)
- `Xenova/distilbert-base-uncased-go-emotions` (ONNX-ready)

### 1.2 Face Emotion Detection (7 emotions)

7 Ekman basic emotions: happy, sad, angry, fear, surprise, disgust, neutral

**Recommended HuggingFace model:**
- `Xenova/facial_emotions_image_detection` (22MB q8, browser ONNX)
- Input: 48x48 grayscale face crop
- Pipeline: WebRTC → Canvas → face-api.js detection → crop → ONNX classify

### 1.3 Behavioral Signals

Derived from `userTypingStateMachine.ts` (XState v5, 8 states):

| Signal | Condition |
|--------|-----------|
| idle | pauseTime > 120s |
| distracted | pauseTime > 30s |
| frustrated | deletionRate > 40% |
| rushed | typingSpeed > 300 CPM |
| careful | typingSpeed < 60 CPM, pauseTime < 5s |
| engaged | default |

### 1.4 Composite Mood Calculation

```typescript
// Face emotions weighted 1.5x higher (more reliable than text keywords)
if (face.confidence > 0.5) {
  if (['happy', 'surprise'].includes(face.emotion)) positiveScore += confidence * 1.5;
  if (['sad', 'angry', 'fear', 'disgust'].includes(face.emotion)) negativeScore += confidence * 1.5;
}

// Mood determination
if (positiveScore > negativeScore * 1.5) mood = 'positive';
else if (negativeScore > positiveScore * 1.5) mood = 'negative';
else if (positiveScore > 0.3 && negativeScore > 0.3) mood = 'mixed';
else mood = 'neutral';

// Action flags
needsSimplification = confusedScore > 0.5 || behavioral === 'frustrated';
needsEncouragement = negativeScore > 1.0 || behavioral === 'frustrated';
needsPatience = behavioral === 'idle' || behavioral === 'distracted';
```

---

## 2. Emotion-Aware LLM System Prompt

**Wired in**: `ChatSession.svelte.ts` → `/api/sse/chat`

The emotion system prompt is generated by `getEmotionSystemPrompt()` and appended to the base legal AI system prompt:

```
[Emotion Context]
The user appears frustrated or upset. Respond with empathy, patience, and encouragement.
The user seems confused. Use simpler language, shorter sentences, and provide examples.
Offer encouragement and reassurance. Acknowledge their effort.
Facial expression: sad (78% confidence).
Text sentiment: confusion.
```

This adapts the LLM's tone without changing its legal accuracy.

---

## 3. ACE Self-Prompting

**File**: `src/lib/server/ace/self-prompt.ts` (138 lines)

### Flow

1. LLM generates response
2. `evaluateResponse()` sends response to Ollama for self-evaluation
3. Returns quality scores: `{ quality, completeness, accuracy, suggestions, shouldRetry }`
4. If `quality < 0.6`, `generateCorrectionPrompt()` creates a retry prompt
5. Max 1 retry per query
6. Evaluations cached in Redis (1hr TTL)

### Evaluation Prompt

```
Evaluate this AI response for quality. Return ONLY valid JSON.
User Question: [truncated to 300 chars]
AI Response: [truncated to 1000 chars]
Rate on a 0.0-1.0 scale and provide suggestions:
{"quality":0.8,"completeness":0.7,"accuracy":0.9,"suggestions":["Add more detail about X"],"shouldRetry":false}
```

### Key Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| quality | < 0.6 | Retry with correction prompt |
| quality | >= 0.6 | Accept response |
| shouldRetry | true | Generate correction prompt |
| evalMs | 10s timeout | Return default 0.7 scores |

---

## 4. User Activity Tracking

### 4.1 Client-Side Heartbeat

**File**: `src/lib/tracking/telemetry.ts`

- Fires on `input` events (typing detector, 800ms debounce)
- Fires on `visibilitychange` (tab focus/blur)
- Sends to `/api/engagement/heartbeat` (POST)

### 4.2 Server-Side Activity Store

**File**: `src/lib/server/engagement/idle-reengagement.ts`

- Redis key: `user:activity:{userId}` → timestamp
- 30-day TTL
- `recordHeartbeat(userId)` — called by heartbeat API
- `getIdleDuration(userId)` — returns ms since last activity
- `getLastActive(userId)` — returns last activity timestamp

### 4.3 XState Typing Machine

**File**: `src/lib/machines/userTypingStateMachine.ts` (417 lines)

8-state machine tracking user typing behavior:

```
idle → typing → not_typing → waiting_user → user_inactive
  ↑       ↓         ↓            ↓              ↓
  └───────┴─────────┴────────────┴──── processing
```

Tracks: avgTypingSpeed, avgPauseTime, patternRecognition, contextualHints, sessionDuration, totalInteractions, userEngagement (low/medium/high)

---

## 5. Idle Re-Engagement Pipeline

**File**: `src/lib/server/engagement/idle-reengagement.ts` (280 lines)

### 5.1 Idle Tiers

| Tier | Threshold | Max/Day | Notification |
|------|-----------|---------|--------------|
| gentle_nudge | 30 min | 2 | "We noticed you stepped away..." |
| feature_highlight | 2 hours | 1 | Random feature highlight |
| daily_digest | 24 hours | 1 | Activity stats digest |
| weekly_reengagement | 7 days | 1 | "We miss you! New features..." |

### 5.2 Scanner

- Runs every 5 minutes (setInterval)
- Started from `hooks.server.ts` on server boot
- Scans all `user:activity:*` Redis keys
- Finds highest applicable idle tier per user
- Checks notification throttle (max per day per tier)
- Sends via `sendNotification()` (ntfy default channel)

### 5.3 Feature Highlights Pool

Randomly selected from 5 features:
1. Evidence Analysis (upload + AI extraction)
2. Case Similarity Search (multi-modal vectors)
3. Citation Collections (organize + export)
4. AI Chat with Case Context (evidence-aware)
5. Cache Monitoring Dashboard (admin)

### 5.4 Daily Digest

Queries PostgreSQL for last 24h activity:
- New evidence items
- New citations
- Cases updated

### 5.5 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/engagement/heartbeat` | Record user activity |
| GET | `/api/engagement/heartbeat` | Check idle duration |
| POST | `/api/engagement/scan` | Manually trigger idle scan |

---

## 6. Multi-Channel Notification Service

**File**: `src/lib/server/notifications/push-service.ts` (210 lines)

### 6.1 Channels

| Channel | Free? | Requires | Status |
|---------|-------|----------|--------|
| Web Push (VAPID) | Yes, unlimited | Service worker + subscription | Implemented |
| ntfy.sh | Yes, unlimited | Nothing (HTTP POST) | Implemented |
| Email (Nodemailer) | 500/day (Gmail) | SMTP credentials | Implemented |
| In-app (toast) | N/A | svelte-sonner | Implemented |

### 6.2 Web Push (VAPID) Architecture

```
Server generates VAPID keypair (public + private)
  │
  ├──→ Client subscribes via PushManager.subscribe()
  │    └──→ Returns PushSubscription (endpoint + keys)
  │
  ├──→ Client sends subscription to POST /api/push
  │    └──→ Stored in push_subscriptions table
  │
  └──→ Server sends notification via web-push npm
       └──→ Browser's push service delivers to service worker
            └──→ service-worker.js shows native notification
```

### 6.3 Service Worker

**File**: `src/service-worker.js` (77 lines)

- `push` event → parse payload → `showNotification()`
- `notificationclick` → `client.navigate(url)` or `openWindow(url)`
- `pushsubscriptionchange` → re-register with server

### 6.4 Toast Notifications (In-App)

**Library**: svelte-sonner v1.0.8

Bridged to existing `notificationStore` via `$effect()` in root `+layout.svelte`:
- New notification added → `toast.success/error/warning/info()` fires
- Position: top-right, rich colors, close button
- Font: JetBrains Mono (matches app theme)

---

## 7. Recommendations (Future Work)

### 7.1 ONNX Emotion Models (HIGH priority)

Replace keyword heuristic with real ONNX models for browser inference:

```
src/lib/ai/emotion/
  ├── face-emotion-onnx.ts    → Xenova/facial_emotions_image_detection (22MB)
  ├── text-emotion-onnx.ts    → distilbert-go-emotions-onnx (67MB, 28 emotions)
  └── object-detection-onnx.ts → YOLOv10n (8MB, 80 classes)
```

Pipeline: WebRTC camera → Canvas frame → face-api.js detect → crop → ONNX classify

### 7.2 Webcam Object Recognition

Use YOLOv10n ONNX model to detect objects in webcam feed. Feed detected objects into chat context:

```
[Visual Context]
User's environment: laptop, coffee mug, desk lamp, open book.
Facial expression: focused (82% confidence).
```

### 7.3 User Analytics Dashboard

Track per-user metrics and display in `/analytics`:
- Session duration history
- Feature usage heatmap
- Emotion trend over time
- Engagement level timeline
- Most-used routes / API endpoints

### 7.4 Personalized Self-Prompting

Extend ACE self-prompt to consider user history:
- If user frequently asks about statutes → prioritize statute citations
- If user prefers brief answers → set max_tokens lower
- If user engagement is "low" → add more examples and step-by-step

### 7.5 Telegram Bot Integration

Free unlimited messaging via Telegram Bot API:
- Create bot via @BotFather
- User links their Telegram in settings
- Re-engagement notifications sent via bot
- Rich formatting (Markdown, inline buttons)

### 7.6 Capacitor Native Push

Wrap SvelteKit SPA with Capacitor 6 for native iOS/Android:
- APNs (Apple Push Notification service) for iOS
- FCM (Firebase Cloud Messaging) for Android
- No PWA limitations on iOS
- Full notification customization (sounds, badges, actions)

### 7.7 Physics ELI5 / Educational Content

Self-prompting for educational re-engagement:
- Detect user's area of interest from chat history
- Generate "explained like I'm 5" summaries
- Send as daily digest notification
- Example: "Today's Legal Concept: What is habeas corpus? Imagine someone takes your favorite toy..."

### 7.8 Infographic Generation

Generate visual re-engagement content:
- Case progress charts (using Chart.js or d3)
- Evidence timeline visualization
- Citation network graph
- Render server-side → attach to email notification

---

## 8. File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/ai/emotion-context.ts` | 252 | Emotion tracking + composite mood + system prompt |
| `src/lib/server/ace/self-prompt.ts` | 138 | ACE self-evaluation + correction prompts |
| `src/lib/server/engagement/idle-reengagement.ts` | 280 | Idle scanner + re-engagement notifications |
| `src/lib/server/notifications/push-service.ts` | 210 | Multi-channel notification dispatcher |
| `src/lib/tracking/telemetry.ts` | 64 | Client-side activity tracking |
| `src/lib/machines/userTypingStateMachine.ts` | 417 | XState v5 typing behavior machine |
| `src/lib/models/ChatSession.svelte.ts` | ~550 | Chat session with emotion context wiring |
| `src/routes/api/sse/chat/+server.ts` | ~660 | SSE chat endpoint with emotion prompt injection |
| `src/routes/api/engagement/heartbeat/+server.ts` | 36 | Heartbeat API (POST=record, GET=check idle) |
| `src/routes/api/engagement/scan/+server.ts` | 22 | Manual idle scan trigger |
| `src/routes/api/push/+server.ts` | 79 | Push subscription management |
| `src/routes/api/push/send/+server.ts` | 78 | Send push notification |
| `src/service-worker.js` | 77 | Web Push event handler |
| `src/lib/push/subscribe.ts` | ~100 | Client push subscription helper |
| `src/hooks.server.ts` | +3L | Idle scanner startup |

---

## 9. Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VAPID_PUBLIC_KEY` | (generated) | Web Push public key |
| `VAPID_PRIVATE_KEY` | (generated) | Web Push private key |
| `VAPID_CONTACT` | `mailto:admin@deeds.legal` | VAPID contact email |
| `NTFY_URL` | `https://ntfy.sh` | ntfy.sh server URL |
| `NTFY_TOPIC` | `deeds-legal-ai` | ntfy.sh topic |
| `SMTP_HOST` | `smtp.gmail.com` | Email SMTP host |
| `SMTP_PORT` | `587` | Email SMTP port |
| `SMTP_USER` | `` | Gmail address |
| `SMTP_PASS` | `` | Gmail app password |
| `SMTP_FROM` | `Deeds Legal AI <noreply@deeds.legal>` | Email from address |
