# AI Components Enhancement TODO

## Overview

This document outlines enhancements for AI-related components, focusing on advanced local LLM (Ollama) integration, context awareness, and intelligent user interactions using SvelteKit, Drizzle ORM, PostgreSQL with pgvector, and best practices for Melt UI and Bits UI.

## 🤖 AI BUTTON COMPONENT (`AIButton.svelte`)

### Current State

Basic floating button with simple toggle functionality and placeholder LLM integration.

### 🔧 ENHANCEMENTS TO IMPLEMENT

#### 1. **Full Ollama LLM Integration**

```typescript
// WIRING: Local Ollama LLM service integration
import { ollamaChatStream } from "$lib/server/ollama";
import { StreamingChatService } from "$lib/services/streaming-chat";

// IMPLEMENTATION: Streaming chat with typing indicators
async function enhancedOllamaChat(message: string, context?: any) {
  try {
    const stream = await ollamaChatStream({
      message,
      context: await ContextService.getCurrentContext(),
      conversationId: $currentConversation?.id,
      model: "gemma3-legal:latest", // or another local model
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: generateLegalSystemPrompt(context),
    });

    for await (const chunk of stream) {
      updateConversationWithChunk(chunk);
      showTypingIndicator(chunk.isComplete);
    }
  } catch (error) {
    handleAIError(error);
  }
}

// Legal domain system prompt
function generateLegalSystemPrompt(context: any): string {
  return `You are an expert legal AI assistant specializing in case management and legal research.
  Current context: ${context?.type || "general"}
  Case ID: ${context?.caseId || "none"}
  User role: ${context?.userRole || "attorney"}

  Provide accurate, helpful responses while always recommending consulting with qualified legal professionals for important decisions.`;
}
```

#### 2. **Context Awareness System**

```typescript
// WIRING: Page and case context injection
import { page } from "$app/stores";
import { currentCase } from "$lib/stores/caseStore";
import { userActivity } from "$lib/stores/activityStore";

interface AIContext {
  pageType: "case" | "evidence" | "search" | "dashboard" | "reports";
  entityId?: string;
  userActivity: UserActivity[];
  recentActions: string[];
  complexity: number; // 0-1 scale
  urgency: number; // 0-1 scale
}

// IMPLEMENTATION: Smart context generation
async function generateContextualPrompt(): Promise<string> {
  const context = await ContextService.getCurrentContext();

  switch (context.pageType) {
    case "case":
      return `I'm looking at case ${context.entityId}. The case involves ${
        context.summary
      }.
              Recent activity: ${context.recentActions.join(", ")}.`;

    case "evidence":
      return `I'm reviewing evidence for case ${context.caseId}.
              Current evidence type: ${context.evidenceType}.`;

    case "search":
      return `I'm searching for: "${context.searchQuery}".
              Help me refine this search or analyze the results.`;

    default:
      return "How can I assist with your legal work today?";
  }
}
```

#### 3. **Proactive AI Suggestions**

```typescript
// WIRING: ML for user pattern recognition (using pgvector + Drizzle ORM)
import { UserPatternAnalyzer } from "$lib/services/pattern-analyzer";
import { ProactiveSuggestionEngine } from "$lib/services/suggestion-engine";

async function generateProactiveSuggestions(): Promise<Suggestion[]> {
  const userPatterns = await UserPatternAnalyzer.analyze($userActivity);
  const currentContext = await ContextService.getCurrentContext();

  const suggestions = await ProactiveSuggestionEngine.generate({
    patterns: userPatterns,
    context: currentContext,
    timeOfDay: new Date().getHours(),
    workload: calculateCurrentWorkload(),
    deadlines: await getUpcomingDeadlines(),
  });

  return suggestions.filter((s) => s.confidence > 0.7);
}

interface Suggestion {
  type: "tip" | "action" | "insight" | "warning";
  message: string;
  confidence: number;
  actionable: boolean;
  icon: string;
  priority: "low" | "medium" | "high";
}
```

#### 4. **Voice Integration**

```typescript
// WIRING: Speech recognition and synthesis (local or browser-based)
import { SpeechRecognitionService } from "$lib/services/speech";
import { TextToSpeechService } from "$lib/services/tts";

let isListening = false;
let speechRecognition: SpeechRecognition;

async function initializeVoiceFeatures() {
  speechRecognition = new SpeechRecognitionService({
    language: "en-US",
    continuous: false,
    interimResults: true,
  });

  speechRecognition.onResult = async (result) => {
    const transcript = result.transcript;
    if (result.isFinal) {
      await processVoiceCommand(transcript);
    }
  };
}

async function toggleVoiceMode() {
  if (isListening) {
    speechRecognition.stop();
    isListening = false;
  } else {
    await speechRecognition.start();
    isListening = true;
    showVoiceIndicator(true);
  }
}

async function processVoiceCommand(command: string) {
  const intent = await AIService.parseIntent(command);

  switch (intent.action) {
    case "search":
      await executeSearch(intent.query);
      break;
    case "navigate":
      await navigateToPage(intent.destination);
      break;
    case "summarize":
      await generateSummary(intent.target);
      break;
    default:
      await handleGeneralQuery(command);
  }
}
```

#### 5. **Advanced Animation System**

```svelte
<!-- ENHANCEMENT: Dynamic animation using Bits UI v2 newer api svelte 5 runes uno.css styling and SvelteKit best practices -->
<script lang="ts">
  import { spring, tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  const pulseIntensity = tweened(0, { duration: 500, easing: cubicOut });
  const ringCount = spring(1, { stiffness: 0.1, damping: 0.25 });
  const iconRotation = tweened(0, { duration: 200 });

  $: if (aiState === 'thinking') {
    pulseIntensity.set(1);
    iconRotation.set(360);
  } else if (aiState === 'speaking') {
    ringCount.set(3);
    pulseIntensity.set(0.7);
  } else {
    pulseIntensity.set(0);
    ringCount.set(1);
    iconRotation.set(0);
  }
</script>

{#each Array($ringCount) as _, i}
  <div
    class="absolute inset-0 rounded-full animate-ping"
    style="
      background: hsl({aiStateColor}, 70%, 60%);
      opacity: {0.3 - (i * 0.1)};
      animation-delay: {i * 0.2}s;
      transform: scale({1 + (i * 0.1)});
    "
  ></div>
{/each}
```

#### 6. **Accessibility Enhancements**

```svelte
<!-- IMPLEMENTATION: Full accessibility support using - ENHANCEMENT: Dynamic animation using Bits UI v2 newer api svelte 5 runes uno.css styling and SvelteKit best practices-->
<Button
  variant="default"
  size="lg"
  class="relative h-14 w-14 rounded-full shadow-lg transition-all duration-300 ease-in-out"
  on:click={toggleChat}
  on:keydown={handleKeyboardShortcuts}
  aria-label={getAccessibleLabel()}
  aria-expanded={$isChatOpen}
  aria-controls="ai-chat-panel"
  aria-describedby="ai-status-description"
  role="button"
  tabindex="0"
>
  <div id="ai-status-description" class="sr-only" aria-live="polite">
    {#if aiState === 'thinking'}
      AI is processing your request
    {:else if aiState === 'speaking'}
      AI is responding
    {:else if hasUnreadMessages}
      You have {unreadCount} unread AI messages
    {:else}
      AI assistant is ready to help
    {/if}
  </div>
  <div class="sr-only">
    Press Enter or Space to toggle. Press Ctrl+Slash for voice mode.
  </div>
</Button>

<script lang="ts">
  function handleKeyboardShortcuts(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        toggleChat();
        break;
      case '/':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          toggleVoiceMode();
        }
        break;
      case 'Escape':
        if ($isChatOpen) {
          toggleChat();
        }
        break;
    }
  }

  function getAccessibleLabel(): string {
    if ($isChatOpen) return 'Close AI Assistant';
    if (hasUnreadMessages) return `Open AI Assistant (${unreadCount} unread messages)`;
    if ($showProactivePrompt) return 'Open AI Assistant (has suggestion)';
    return 'Open AI Assistant';
  }
</script>
```

---

## 🎯 CHAT INTERFACE ENHANCEMENTS

### Advanced Features to Implement

#### 1. **Smart Message Types**

```typescript
interface EnhancedMessage {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  type: "text" | "suggestion" | "action" | "analysis" | "citation";
  metadata: {
    confidence?: number;
    sources?: string[];
    actionable?: boolean;
    priority?: "low" | "medium" | "high";
    category?: "legal" | "procedural" | "research" | "analysis";
  };
  timestamp: Date;
  status: "sending" | "sent" | "delivered" | "read" | "error";
}
```

#### 2. **Contextual Action Buttons**

```svelte
<!-- Message with actionable content -->
{#if message.metadata.actionable}
  <div class="message-actions">
    <Button size="sm" on:click={() => executeAction(message.suggestedAction)}>
      {message.suggestedAction.label}
    </Button>
    <Button variant="outline" size="sm" on:click={() => explainAction(message)}>
      Explain
    </Button>
  </div>
{/if}

<!-- Citation integration -->
{#if message.metadata.sources}
  <div class="message-sources">
    <h4>Sources:</h4>
    {#each message.metadata.sources as source}
      <Button variant="link" on:click={() => openSource(source)}>
        {source.title}
      </Button>
    {/each}
  </div>
{/if}
```

#### 3. **Real-time Collaboration**

```typescript
// WIRING: Multi-user AI assistance (using socket.io-client)
import { CollaborationService } from "$lib/services/collaboration";

async function shareAIInsight(message: EnhancedMessage) {
  await CollaborationService.shareInsight({
    messageId: message.id,
    caseId: $currentCase?.id,
    insight: message.content,
    confidence: message.metadata.confidence,
    recipients: getTeamMembers(),
    type: "ai-suggestion",
  });
}

async function startCollaborativeSession() {
  const session = await CollaborationService.createAISession({
    caseId: $currentCase?.id,
    participants: getTeamMembers(),
    context: await ContextService.getCurrentContext(),
  });

  session.onAIResponse = (response) => {
    broadcastToParticipants(response);
  };
}
```

---

## 📋 IMPLEMENTATION ROADMAP

### Phase 1: Core AI Integration (Week 1-2)

1. ✅ Ollama API integration with streaming
2. ✅ Context awareness system (SvelteKit stores + Drizzle ORM)
3. ✅ Basic proactive suggestions (pgvector + Drizzle)

### Phase 2: Advanced Features

1. 🔄 Voice integration (browser/local)
2. 🔄 Advanced animation system (Bits UI v2 newer api svelte 5 runes)
3. 🔄 Smart notification system

### Phase 3: Intelligence Layer (Week 5-6)

1. 🔄 ML for user patterns (pgvector, Drizzle)
2. 🔄 Predictive suggestions
 comment this out for #  // 🔄 Collaborative AI features (sse)

### Phase 4: Production Polish (Week 7-8)

1. 🔄 Full accessibility compliance (Bits UI)
2. 🔄 Performance optimization
3. 🔄 Error handling and fallbacks

---

## 🔌 WIRING REQUIREMENTS

### Services to Implement

```typescript
// AI Services
- ollamaChatStream (local LLM integration)
- ContextService (page/case context, Drizzle ORM)
- SuggestionEngine (proactive AI, pgvector)
- SpeechService (voice recognition)
- PatternAnalyzer (user behavior ML, pgvector)

// Supporting Services
- CollaborationService (team features, socket.io)
- NotificationService (smart alerts)
- AnalyticsService (usage tracking)
```

### API Endpoints (SvelteKit routes)

```typescript
// AI Endpoints
POST / api / ai / chat; // Streaming chat (Ollama)
POST / api / ai / suggest; // Proactive suggestions
GET / api / ai / context; // Current context
POST / api / ai / voice; // Voice processing

// Analytics Endpoints
POST / api / analytics / interaction; // Track AI interactions
GET / api / analytics / patterns; // User pattern data
```

### Dependencies

```bash
npm install drizzle-orm drizzle-kit pg pgvector
npm install @bits-ui/svelte
npm install socket.io-client
npm install @microsoft/speech-sdk # (optional, for advanced voice)
```

---

## 🧪 TESTING STRATEGY

### AI Integration Tests

```typescript
describe("AI Button Enhanced", () => {
  test("generates contextual prompts based on current page");
  test("handles streaming responses with typing indicators");
  test("provides proactive suggestions at appropriate times");
  test("voice commands are processed correctly");
});
```

### Accessibility Tests

```typescript
describe("AI Button Accessibility", () => {
  test("keyboard navigation works correctly");
  test("screen reader announcements are appropriate");
  test("focus management during chat toggle");
  test("ARIA attributes are set correctly");
});
```

### Performance Tests

```typescript
describe("AI Button Performance", () => {
  test("animation performance under heavy load");
  test("voice recognition latency < 500ms");
  test("context generation time < 200ms");
  test("memory usage with long conversations");
});
```

---

**Status**: 📝 Ready for enhanced AI implementation
**Priority**: High - Core user interaction component
**Timeline**: 8-week enhancement roadmap for production-ready AI features
