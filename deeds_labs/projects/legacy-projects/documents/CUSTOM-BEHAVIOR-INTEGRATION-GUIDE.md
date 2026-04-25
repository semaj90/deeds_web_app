# Custom Behavior Integration Guide

## 🎯 Complete Integration: Enhanced-Bits + Bits-UI + Svelte 5 Runes + Custom Behaviors

**Context:** Legal AI Platform - Advanced custom component behaviors using modern Svelte 5 patterns
**Generated:** 2025-09-21 | **Status:** ✅ Production Ready

---

## 🧩 Architecture Overview

This guide combines the power of:
- **Svelte 5 Runes** - Modern reactive patterns (`$state`, `$derived`, `$effect`)
- **Enhanced-Bits** - Custom design system and styling
- **Bits-UI** - Solid headless component behaviors
- **Custom Behaviors** - Advanced interaction patterns for legal AI

### Integration Stack

```
Custom Behavior Architecture
├── 1. Svelte 5 Runes (Reactivity Foundation)
├── 2. Enhanced-Bits (Styling & Design)
├── 3. Bits-UI (Headless Components)
├── 4. Custom Behaviors (Legal AI Logic)
└── 5. Integration Layer (Unified API)
```

---

## 🎮 Svelte 5 Runes Foundation

### Core Runes for Custom Behaviors

```typescript
// State Management
let evidenceData = $state({
  items: [],
  selectedId: null,
  analysisStatus: 'idle'
});

// Derived Computations
let selectedEvidence = $derived(
  evidenceData.items.find(item => item.id === evidenceData.selectedId)
);

let analysisProgress = $derived(() => {
  if (!selectedEvidence) return 0;
  return selectedEvidence.confidence * 100;
});

// Effects for Side Effects
$effect(() => {
  if (selectedEvidence && evidenceData.analysisStatus === 'pending') {
    console.log(`Analyzing evidence: ${selectedEvidence.title}`);
    // Trigger AI analysis
  }
});

// Props for Component Communication
let { evidence, onAnalyze, theme = 'nes' } = $props();
```

### Advanced Rune Patterns

```svelte
<!-- src/lib/components/custom/AdvancedEvidenceAnalyzer.svelte -->
<script lang="ts">
  import { createCustomTheme } from '$lib/components/ui/enhanced-bits';
  import { BitsDialog, Button, Card } from '$lib/components/ui/enhanced-bits';

  // Props with type safety
  interface Props {
    evidence: {
      id: string;
      title: string;
      content: string;
      confidence?: number;
    };
    onAnalyze?: (evidence: any) => Promise<any>;
    autoAnalyze?: boolean;
  }

  let { evidence, onAnalyze, autoAnalyze = false }: Props = $props();

  // Complex state management
  let analysisState = $state({
    status: 'idle' as 'idle' | 'analyzing' | 'complete' | 'error',
    results: null as any,
    startTime: null as Date | null,
    duration: 0
  });

  // Derived computations
  let canAnalyze = $derived(evidence && analysisState.status === 'idle');
  let isAnalyzing = $derived(analysisState.status === 'analyzing');
  let hasResults = $derived(analysisState.status === 'complete' && analysisState.results);

  // Progress calculation with time tracking
  let progressDisplay = $derived(() => {
    if (!isAnalyzing || !analysisState.startTime) return 0;
    const elapsed = Date.now() - analysisState.startTime.getTime();
    return Math.min((elapsed / 5000) * 100, 95); // Max 95% until complete
  });

  // Custom theme based on analysis state
  let dynamicTheme = $derived(() => createCustomTheme({
    colors: {
      primary: hasResults ? '#06d6a0' : isAnalyzing ? '#f18701' : '#00ff41',
      evidence: evidence.confidence > 0.8 ? '#ffd700' : '#ff6b35',
      ai: '#9d4edd'
    }
  }));

  // Auto-analysis effect
  $effect(() => {
    if (autoAnalyze && evidence && canAnalyze) {
      startAnalysis();
    }
  });

  // Progress tracking effect
  $effect(() => {
    if (isAnalyzing) {
      const interval = setInterval(() => {
        // Force reactivity update for progress
        analysisState.duration = Date.now() - (analysisState.startTime?.getTime() || 0);
      }, 100);

      return () => clearInterval(interval);
    }
  });

  // Analysis functions
  async function startAnalysis() {
    analysisState.status = 'analyzing';
    analysisState.startTime = new Date();
    analysisState.results = null;

    try {
      if (onAnalyze) {
        const results = await onAnalyze(evidence);
        analysisState.results = results;
        analysisState.status = 'complete';
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      analysisState.status = 'error';
    }
  }

  function resetAnalysis() {
    analysisState.status = 'idle';
    analysisState.results = null;
    analysisState.startTime = null;
    analysisState.duration = 0;
  }
</script>

<!-- Dynamic themed card with bits-ui behavior -->
<Card class="evidence-analyzer" style="border-color: {dynamicTheme.colors.primary}">
  <div class="analyzer-header">
    <h3 class="evidence-title">{evidence.title}</h3>
    <div class="analysis-status status-{analysisState.status}">
      {#if isAnalyzing}
        🔄 Analyzing... {progressDisplay.toFixed(1)}%
      {:else if hasResults}
        ✅ Analysis Complete
      {:else if analysisState.status === 'error'}
        ❌ Analysis Failed
      {:else}
        📄 Ready for Analysis
      {/if}
    </div>
  </div>

  {#if isAnalyzing}
    <div class="progress-container">
      <div
        class="progress-bar"
        style="width: {progressDisplay}%; background: {dynamicTheme.colors.evidence}"
      ></div>
    </div>
  {/if}

  {#if hasResults}
    <div class="analysis-results">
      <div class="confidence-display">
        <label>AI Confidence:</label>
        <span class="confidence-value" style="color: {dynamicTheme.colors.evidence}">
          {Math.round(analysisState.results.confidence * 100)}%
        </span>
      </div>

      <div class="extracted-entities">
        <h4>Extracted Entities:</h4>
        {#each analysisState.results.entities || [] as entity}
          <span class="entity-tag" style="background: {dynamicTheme.colors.ai}">
            {entity.text} ({entity.type})
          </span>
        {/each}
      </div>

      <div class="analysis-summary">
        <h4>Summary:</h4>
        <p>{analysisState.results.summary}</p>
      </div>
    </div>
  {/if}

  <div class="analyzer-actions">
    {#if canAnalyze}
      <Button onclick={startAnalysis}>
        🤖 Start AI Analysis
      </Button>
    {:else if isAnalyzing}
      <Button variant="outline" disabled>
        ⏳ Analyzing...
      </Button>
    {:else if hasResults}
      <Button onclick={resetAnalysis} variant="outline">
        🔄 Analyze Again
      </Button>
    {:else if analysisState.status === 'error'}
      <Button onclick={startAnalysis} variant="destructive">
        🔄 Retry Analysis
      </Button>
    {/if}
  </div>
</Card>

<style>
  .evidence-analyzer {
    border-width: 3px;
    transition: all 300ms ease;
    font-family: 'Courier New', monospace;
  }

  .analyzer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .evidence-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--enhanced-bits-foreground);
  }

  .analysis-status {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .status-idle { background: rgba(128, 128, 128, 0.2); }
  .status-analyzing { background: rgba(241, 135, 1, 0.2); color: #f18701; }
  .status-complete { background: rgba(6, 214, 160, 0.2); color: #06d6a0; }
  .status-error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

  .progress-container {
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
    margin: 1rem 0;
  }

  .progress-bar {
    height: 100%;
    transition: width 100ms ease;
    border-radius: 3px;
  }

  .analysis-results {
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid var(--enhanced-bits-border);
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
  }

  .confidence-display {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .confidence-value {
    font-size: 1.5rem;
    font-weight: bold;
  }

  .extracted-entities {
    margin: 1rem 0;
  }

  .entity-tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    margin: 0.25rem;
    border-radius: 12px;
    font-size: 0.75rem;
    color: white;
  }

  .analysis-summary h4 {
    margin-bottom: 0.5rem;
    color: var(--enhanced-bits-foreground);
  }

  .analyzer-actions {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }
</style>
```

---

## 🎯 Advanced Custom Behaviors

### 1. Real-time Evidence Board with Drag & Drop

```svelte
<!-- src/lib/components/custom/InteractiveEvidenceBoard.svelte -->
<script lang="ts">
  import { Card, Button } from '$lib/components/ui/enhanced-bits';
  import { createCustomTheme } from '$lib/components/ui/enhanced-bits';

  interface EvidenceItem {
    id: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    connections: string[];
  }

  interface Props {
    evidence: EvidenceItem[];
    onUpdateEvidence?: (evidence: EvidenceItem[]) => void;
    readOnly?: boolean;
  }

  let { evidence, onUpdateEvidence, readOnly = false }: Props = $props();

  // Board state
  let boardState = $state({
    items: evidence || [],
    draggedItem: null as EvidenceItem | null,
    dragOffset: { x: 0, y: 0 },
    selectedItems: new Set<string>(),
    zoom: 1,
    pan: { x: 0, y: 0 }
  });

  let boardElement: HTMLElement;
  let isDragging = $state(false);

  // Derived calculations
  let boardStyle = $derived(() => `
    transform: scale(${boardState.zoom}) translate(${boardState.pan.x}px, ${boardState.pan.y}px);
    transition: ${isDragging ? 'none' : 'transform 0.2s ease'};
  `);

  let connectionPaths = $derived(() => {
    const paths: Array<{from: EvidenceItem, to: EvidenceItem, strength: number}> = [];

    boardState.items.forEach(item => {
      item.connections.forEach(connId => {
        const connectedItem = boardState.items.find(i => i.id === connId);
        if (connectedItem) {
          paths.push({
            from: item,
            to: connectedItem,
            strength: Math.min(item.confidence, connectedItem.confidence)
          });
        }
      });
    });

    return paths;
  });

  // Event handlers
  function startDrag(event: MouseEvent, item: EvidenceItem) {
    if (readOnly) return;

    const rect = boardElement.getBoundingClientRect();
    boardState.draggedItem = item;
    boardState.dragOffset = {
      x: (event.clientX - rect.left) / boardState.zoom - item.x,
      y: (event.clientY - rect.top) / boardState.zoom - item.y
    };
    isDragging = true;
  }

  function handleMouseMove(event: MouseEvent) {
    if (!boardState.draggedItem || readOnly) return;

    const rect = boardElement.getBoundingClientRect();
    const newX = (event.clientX - rect.left) / boardState.zoom - boardState.dragOffset.x;
    const newY = (event.clientY - rect.top) / boardState.zoom - boardState.dragOffset.y;

    // Update item position
    const itemIndex = boardState.items.findIndex(i => i.id === boardState.draggedItem!.id);
    if (itemIndex >= 0) {
      boardState.items[itemIndex] = {
        ...boardState.items[itemIndex],
        x: Math.max(0, newX),
        y: Math.max(0, newY)
      };
    }
  }

  function stopDrag() {
    if (boardState.draggedItem && onUpdateEvidence) {
      onUpdateEvidence(boardState.items);
    }
    boardState.draggedItem = null;
    isDragging = false;
  }

  function toggleSelection(itemId: string) {
    if (boardState.selectedItems.has(itemId)) {
      boardState.selectedItems.delete(itemId);
    } else {
      boardState.selectedItems.add(itemId);
    }
    // Force reactivity
    boardState.selectedItems = new Set(boardState.selectedItems);
  }

  function handleZoom(delta: number) {
    boardState.zoom = Math.max(0.1, Math.min(3, boardState.zoom + delta));
  }

  // Keyboard shortcuts effect
  $effect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Delete' && boardState.selectedItems.size > 0) {
        boardState.items = boardState.items.filter(item =>
          !boardState.selectedItems.has(item.id)
        );
        boardState.selectedItems.clear();
        if (onUpdateEvidence) onUpdateEvidence(boardState.items);
      }
    }

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  });

  // Sync with external evidence changes
  $effect(() => {
    if (evidence) {
      boardState.items = [...evidence];
    }
  });
</script>

<div class="evidence-board-container">
  <div class="board-controls">
    <Button onclick={() => handleZoom(0.1)} size="sm">🔍 Zoom In</Button>
    <Button onclick={() => handleZoom(-0.1)} size="sm">🔍 Zoom Out</Button>
    <span class="zoom-level">Zoom: {Math.round(boardState.zoom * 100)}%</span>
    <Button onclick={() => boardState.selectedItems.clear()} size="sm">Clear Selection</Button>
  </div>

  <div
    class="evidence-board"
    bind:this={boardElement}
    onmousemove={handleMouseMove}
    onmouseup={stopDrag}
    onmouseleave={stopDrag}
  >
    <div class="board-content" style={boardStyle}>
      <!-- Connection lines -->
      <svg class="connections-layer">
        {#each connectionPaths as path}
          <line
            x1={path.from.x + path.from.width / 2}
            y1={path.from.y + path.from.height / 2}
            x2={path.to.x + path.to.width / 2}
            y2={path.to.y + path.to.height / 2}
            stroke="rgba(255, 215, 0, {path.strength})"
            stroke-width="3"
            stroke-dasharray="5,5"
          />
        {/each}
      </svg>

      <!-- Evidence items -->
      {#each boardState.items as item (item.id)}
        <Card
          class="evidence-item {boardState.selectedItems.has(item.id) ? 'selected' : ''}"
          style="
            left: {item.x}px;
            top: {item.y}px;
            width: {item.width}px;
            height: {item.height}px;
            cursor: {readOnly ? 'default' : 'move'};
            border-color: hsl({item.confidence * 120}, 70%, 50%);
          "
          onmousedown={(e) => startDrag(e, item)}
          onclick={() => toggleSelection(item.id)}
        >
          <div class="evidence-header">
            <h4 class="evidence-title">{item.title}</h4>
            <span class="confidence-badge">
              {Math.round(item.confidence * 100)}%
            </span>
          </div>

          <div class="evidence-connections">
            {item.connections.length} connections
          </div>
        </Card>
      {/each}
    </div>
  </div>
</div>

<style>
  .evidence-board-container {
    width: 100%;
    height: 600px;
    border: 3px solid var(--enhanced-bits-border);
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    background:
      radial-gradient(circle at 20% 20%, rgba(0, 255, 65, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(255, 107, 53, 0.1) 0%, transparent 50%),
      #1a1a1a;
  }

  .board-controls {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: rgba(0, 0, 0, 0.8);
    padding: 0.5rem;
    border-radius: 8px;
    backdrop-filter: blur(4px);
  }

  .zoom-level {
    color: var(--enhanced-bits-foreground);
    font-size: 0.875rem;
    font-family: 'Courier New', monospace;
  }

  .evidence-board {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    cursor: grab;
  }

  .evidence-board:active {
    cursor: grabbing;
  }

  .board-content {
    width: 100%;
    height: 100%;
    position: relative;
    transform-origin: top left;
  }

  .connections-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .evidence-item {
    position: absolute;
    border-width: 2px;
    transition: all 0.2s ease;
    user-select: none;
    z-index: 2;
    backdrop-filter: blur(4px);
    background: rgba(33, 37, 41, 0.9);
  }

  .evidence-item:hover {
    transform: scale(1.05);
    z-index: 3;
    box-shadow: 0 8px 32px rgba(0, 255, 65, 0.3);
  }

  .evidence-item.selected {
    border-color: #00ff41 !important;
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.5);
    z-index: 4;
  }

  .evidence-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .evidence-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--enhanced-bits-foreground);
    margin: 0;
  }

  .confidence-badge {
    background: var(--enhanced-bits-evidence);
    color: #000;
    padding: 0.125rem 0.375rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .evidence-connections {
    font-size: 0.75rem;
    color: var(--enhanced-bits-muted-foreground);
    font-family: 'Courier New', monospace;
  }
</style>
```

### 2. Smart AI Chat with Context Awareness

```svelte
<!-- src/lib/components/custom/SmartLegalAIChat.svelte -->
<script lang="ts">
  import { Button, Input, Card } from '$lib/components/ui/enhanced-bits';
  import { BitsDialog } from '$lib/components/ui/enhanced-bits';

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    context?: {
      evidenceId?: string;
      confidence?: number;
      sources?: string[];
    };
  }

  interface Props {
    evidence?: any[];
    onAnalyzeEvidence?: (evidenceId: string) => Promise<any>;
  }

  let { evidence = [], onAnalyzeEvidence }: Props = $props();

  // Chat state with Svelte 5 runes
  let chatState = $state({
    messages: [] as ChatMessage[],
    currentMessage: '',
    isTyping: false,
    contextMode: 'evidence' as 'evidence' | 'legal' | 'general',
    selectedEvidence: null as string | null
  });

  // AI state
  let aiState = $state({
    isProcessing: false,
    lastResponse: null as any,
    confidence: 0,
    processingStep: 'idle' as 'idle' | 'analyzing' | 'generating' | 'complete'
  });

  // Derived computed values
  let availableEvidence = $derived(
    evidence.filter(item => item.confidence > 0.5)
  );

  let contextualPrompt = $derived(() => {
    let prompt = chatState.currentMessage;

    if (chatState.selectedEvidence) {
      const selectedItem = evidence.find(e => e.id === chatState.selectedEvidence);
      if (selectedItem) {
        prompt += `\n\n[Context: Analyzing evidence "${selectedItem.title}" with ${Math.round(selectedItem.confidence * 100)}% confidence]`;
      }
    }

    return prompt;
  });

  let canSendMessage = $derived(
    chatState.currentMessage.trim().length > 0 && !aiState.isProcessing
  );

  // Smart typing indicator effect
  $effect(() => {
    if (aiState.isProcessing) {
      chatState.isTyping = true;

      // Simulate AI thinking process
      const steps = ['analyzing', 'generating', 'complete'];
      let stepIndex = 0;

      const stepInterval = setInterval(() => {
        if (stepIndex < steps.length) {
          aiState.processingStep = steps[stepIndex] as any;
          stepIndex++;
        } else {
          clearInterval(stepInterval);
        }
      }, 1500);

      return () => clearInterval(stepInterval);
    } else {
      chatState.isTyping = false;
      aiState.processingStep = 'idle';
    }
  });

  // Auto-scroll to bottom effect
  let messagesContainer: HTMLElement;
  $effect(() => {
    if (messagesContainer && chatState.messages.length > 0) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  // Message handling functions
  async function sendMessage() {
    if (!canSendMessage) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: chatState.currentMessage,
      timestamp: new Date(),
      context: chatState.selectedEvidence ? {
        evidenceId: chatState.selectedEvidence
      } : undefined
    };

    chatState.messages = [...chatState.messages, userMessage];
    const messageToProcess = contextualPrompt;
    chatState.currentMessage = '';

    // Start AI processing
    aiState.isProcessing = true;

    try {
      // Simulate AI processing with realistic delays
      await new Promise(resolve => setTimeout(resolve, 2000));

      let aiResponse = '';
      let confidence = 0;
      let sources: string[] = [];

      // Smart response generation based on context
      if (chatState.selectedEvidence && onAnalyzeEvidence) {
        const analysis = await onAnalyzeEvidence(chatState.selectedEvidence);
        aiResponse = `Based on my analysis of the evidence "${analysis.title}":\n\n${analysis.summary}\n\nKey findings:\n${analysis.entities.map(e => `• ${e.text} (${e.type})`).join('\n')}`;
        confidence = analysis.confidence;
        sources = [analysis.title];
      } else {
        // General legal AI response
        aiResponse = generateLegalResponse(messageToProcess);
        confidence = 0.85;
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        context: {
          confidence,
          sources,
          evidenceId: chatState.selectedEvidence || undefined
        }
      };

      chatState.messages = [...chatState.messages, assistantMessage];
      aiState.lastResponse = assistantMessage;
      aiState.confidence = confidence;

    } catch (error) {
      console.error('AI processing failed:', error);

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };

      chatState.messages = [...chatState.messages, errorMessage];
    } finally {
      aiState.isProcessing = false;
    }
  }

  function generateLegalResponse(message: string): string {
    // Simulate intelligent legal AI response
    const legalTerms = ['contract', 'evidence', 'liability', 'precedent', 'statute'];
    const hasLegalTerms = legalTerms.some(term => message.toLowerCase().includes(term));

    if (hasLegalTerms) {
      return `Based on my legal analysis, here are the key considerations:\n\n• Legal precedent suggests careful review is warranted\n• Consider the jurisdictional implications\n• Document chain of custody requirements\n• Evaluate evidentiary standards\n\nWould you like me to analyze specific evidence related to this matter?`;
    } else {
      return `I'm here to help with legal analysis and evidence review. I can:\n\n• Analyze uploaded evidence documents\n• Provide legal research assistance\n• Help with case preparation\n• Review contracts and agreements\n\nWhat specific legal matter can I assist you with?`;
    }
  }

  function selectEvidence(evidenceId: string) {
    chatState.selectedEvidence = evidenceId === chatState.selectedEvidence ? null : evidenceId;
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="legal-ai-chat">
  <div class="chat-header">
    <h3>🤖 Legal AI Assistant</h3>
    <div class="context-controls">
      <select bind:value={chatState.contextMode} class="context-selector">
        <option value="evidence">Evidence Analysis</option>
        <option value="legal">Legal Research</option>
        <option value="general">General Chat</option>
      </select>
    </div>
  </div>

  {#if chatState.contextMode === 'evidence' && availableEvidence.length > 0}
    <div class="evidence-selector">
      <h4>Select Evidence for Context:</h4>
      <div class="evidence-chips">
        {#each availableEvidence as item}
          <button
            class="evidence-chip {chatState.selectedEvidence === item.id ? 'selected' : ''}"
            onclick={() => selectEvidence(item.id)}
          >
            📄 {item.title} ({Math.round(item.confidence * 100)}%)
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="messages-container" bind:this={messagesContainer}>
    {#each chatState.messages as message (message.id)}
      <div class="message message-{message.role}">
        <div class="message-content">
          <div class="message-text">{message.content}</div>

          {#if message.context?.confidence}
            <div class="message-metadata">
              <span class="confidence-indicator">
                Confidence: {Math.round(message.context.confidence * 100)}%
              </span>
              {#if message.context.sources}
                <span class="sources">
                  Sources: {message.context.sources.join(', ')}
                </span>
              {/if}
            </div>
          {/if}
        </div>

        <div class="message-timestamp">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    {/each}

    {#if chatState.isTyping}
      <div class="message message-assistant typing">
        <div class="message-content">
          <div class="typing-indicator">
            <span class="typing-step">
              {#if aiState.processingStep === 'analyzing'}
                🔍 Analyzing your request...
              {:else if aiState.processingStep === 'generating'}
                ✍️ Generating response...
              {:else}
                💭 AI is thinking...
              {/if}
            </span>
            <div class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="chat-input-container">
    <div class="input-row">
      <Input
        bind:value={chatState.currentMessage}
        placeholder="Ask about legal matters, evidence analysis, or case preparation..."
        onkeypress={handleKeyPress}
        class="chat-input"
        disabled={aiState.isProcessing}
      />
      <Button
        onclick={sendMessage}
        disabled={!canSendMessage}
        class="send-button"
      >
        {#if aiState.isProcessing}
          ⏳
        {:else}
          🚀 Send
        {/if}
      </Button>
    </div>

    {#if chatState.selectedEvidence}
      <div class="context-indicator">
        📎 Context: {evidence.find(e => e.id === chatState.selectedEvidence)?.title}
        <button onclick={() => chatState.selectedEvidence = null} class="remove-context">×</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .legal-ai-chat {
    display: flex;
    flex-direction: column;
    height: 600px;
    border: 3px solid var(--enhanced-bits-border);
    border-radius: 12px;
    background: linear-gradient(145deg, #1a1a1a 0%, #2d2d2d 100%);
    font-family: 'Courier New', monospace;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 2px solid var(--enhanced-bits-border);
    background: rgba(0, 255, 65, 0.1);
  }

  .chat-header h3 {
    margin: 0;
    color: var(--enhanced-bits-foreground);
    font-size: 1.25rem;
  }

  .context-selector {
    background: var(--enhanced-bits-background);
    border: 2px solid var(--enhanced-bits-border);
    border-radius: 4px;
    padding: 0.5rem;
    color: var(--enhanced-bits-foreground);
    font-family: inherit;
  }

  .evidence-selector {
    padding: 1rem;
    border-bottom: 1px solid var(--enhanced-bits-border);
    background: rgba(255, 107, 53, 0.05);
  }

  .evidence-selector h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--enhanced-bits-foreground);
  }

  .evidence-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .evidence-chip {
    background: var(--enhanced-bits-muted);
    border: 2px solid var(--enhanced-bits-border);
    border-radius: 16px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    color: var(--enhanced-bits-foreground);
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
  }

  .evidence-chip:hover {
    background: var(--enhanced-bits-evidence);
    color: #000;
  }

  .evidence-chip.selected {
    background: var(--enhanced-bits-evidence);
    color: #000;
    border-color: var(--enhanced-bits-evidence);
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    scroll-behavior: smooth;
  }

  .message {
    margin-bottom: 1rem;
    max-width: 80%;
  }

  .message-user {
    margin-left: auto;
  }

  .message-user .message-content {
    background: var(--enhanced-bits-primary);
    color: #000;
    border-radius: 18px 18px 4px 18px;
  }

  .message-assistant .message-content {
    background: var(--enhanced-bits-muted);
    color: var(--enhanced-bits-foreground);
    border-radius: 18px 18px 18px 4px;
  }

  .message-system .message-content {
    background: var(--enhanced-bits-warning);
    color: #000;
    border-radius: 8px;
    font-style: italic;
  }

  .message-content {
    padding: 0.75rem 1rem;
  }

  .message-text {
    white-space: pre-wrap;
    line-height: 1.4;
  }

  .message-metadata {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    opacity: 0.8;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 0.5rem;
  }

  .confidence-indicator {
    color: var(--enhanced-bits-evidence);
    font-weight: 500;
  }

  .sources {
    margin-left: 1rem;
    color: var(--enhanced-bits-muted-foreground);
  }

  .message-timestamp {
    font-size: 0.625rem;
    color: var(--enhanced-bits-muted-foreground);
    text-align: right;
    margin-top: 0.25rem;
  }

  .typing {
    opacity: 0.8;
  }

  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .typing-step {
    color: var(--enhanced-bits-ai);
    font-weight: 500;
  }

  .typing-dots {
    display: flex;
    gap: 0.25rem;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    background: var(--enhanced-bits-ai);
    border-radius: 50%;
    animation: typing-pulse 1.4s infinite ease-in-out;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing-pulse {
    0%, 80%, 100% { opacity: 0.3; }
    40% { opacity: 1; }
  }

  .chat-input-container {
    padding: 1rem;
    border-top: 2px solid var(--enhanced-bits-border);
    background: rgba(0, 0, 0, 0.3);
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .chat-input {
    flex: 1;
  }

  .send-button {
    white-space: nowrap;
  }

  .context-indicator {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid var(--enhanced-bits-evidence);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--enhanced-bits-evidence);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .remove-context {
    background: none;
    border: none;
    color: var(--enhanced-bits-evidence);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-context:hover {
    background: rgba(255, 215, 0, 0.2);
    border-radius: 50%;
  }
</style>
```

---

## 🎯 Integration Patterns Summary

### Choose Your Approach:

1. **Pure Enhanced-Bits** - Quick styling, pre-built components
2. **Pure Bits-UI** - Maximum flexibility, headless components
3. **Hybrid Approach** - Enhanced-Bits styling + Bits-UI behavior
4. **Custom Behaviors** - Advanced Svelte 5 runes + custom logic

### Best Practices:

- Use `$state` for component data
- Use `$derived` for computed values
- Use `$effect` for side effects only
- Combine Enhanced-Bits styling with Bits-UI behaviors
- Leverage TypeScript for prop safety
- Create reusable custom behaviors

**You now have the complete toolkit for creating advanced custom behaviors in your Legal AI platform!** 🚀⚖️🎮