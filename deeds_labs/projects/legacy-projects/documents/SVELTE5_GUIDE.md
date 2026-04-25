# Svelte 5 Guide for Legal AI Platform

This guide covers Svelte 5 concepts and patterns specifically tailored for our sophisticated legal AI platform with microservices architecture, WebAssembly inference, and GPU acceleration.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Svelte Files](#svelte-files)
4. [Runes System](#runes-system)
5. [State Management](#state-management)
6. [Reactivity & Effects](#reactivity--effects)
7. [Component Props](#component-props)
8. [Event Handling](#event-handling)
9. [Legal AI Platform Patterns](#legal-ai-platform-patterns)
10. [Best Practices](#best-practices)

---

## Overview

Svelte 5 is a framework for building user interfaces on the web using a compiler-based approach. For our legal AI platform, Svelte 5 provides:

- **Runes-based reactivity** for managing complex legal document state
- **Fine-grained reactivity** for real-time evidence canvas updates
- **Efficient DOM updates** for handling large legal datasets
- **TypeScript integration** with our 37+ Go microservices

### Key Features for Legal AI

```svelte
<!-- Example: Legal Document Analysis Component -->
<script>
  import { productionServiceClient } from '$lib/api/production-service-client';
  import xstateIntegration from '$lib/services/xstate-integration';

  // Svelte 5 runes for reactive state
  let documents = $state([]);
  let analysisResults = $state(null);
  let isAnalyzing = $state(false);

  // Derived state for legal risk assessment
  let riskLevel = $derived(() => {
    if (!analysisResults) return 'unknown';
    return analysisResults.riskScore > 0.7 ? 'high' : 'low';
  });
</script>
```

---

## Getting Started

Our legal AI platform uses SvelteKit 2 + Svelte 5 with the following setup:

```bash
# Already configured in our platform
npm run dev  # Starts on port 5173
npm run build
npm run preview
```

### Project Structure

```
sveltekit-frontend/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── canvas/           # Evidence canvas components
│   │   │   ├── ai/               # AI integration components
│   │   │   └── dashboard/        # Legal dashboard components
│   │   ├── services/
│   │   │   ├── xstate-integration.ts  # XState v5 coordinator
│   │   │   └── webgpu-texture-streaming.ts
│   │   └── types/
│   └── routes/
│       ├── api/                  # SvelteKit API routes
│       └── tensorrt/             # TensorRT-LLM integration
```

---

## Svelte Files

Svelte components consist of three optional sections:

### Basic Structure

```svelte
<!-- Legal Document Viewer Example -->
<script module>
  // Module-level logic (runs once)
  let totalDocumentsProcessed = 0;
</script>

<script>
  // Instance-level logic
  import { LegalDocumentProcessor } from '$lib/ai/document-processor';

  let document = $state(null);
  let isProcessing = $state(false);

  totalDocumentsProcessed += 1;
</script>

<style>
  .legal-document {
    /* Scoped styles for this component */
    border: 1px solid var(--legal-border-color);
    padding: 1rem;
  }
</style>

<!-- Markup -->
<div class="legal-document">
  {#if document}
    <h2>{document.title}</h2>
    <p>Risk Level: {document.riskLevel}</p>
  {/if}
</div>
```

### TypeScript Support

```svelte
<script lang="ts">
  import type { LegalDocument, RiskAssessment } from '$types/legal';

  interface Props {
    document: LegalDocument;
    onAnalyze?: (result: RiskAssessment) => void;
  }

  let { document, onAnalyze }: Props = $props();
</script>
```

---

## Runes System

Runes are Svelte 5's reactive primitives. They use `$` prefix and are compiler keywords.

### Available Runes

| Rune | Purpose | Example |
|------|---------|---------|
| `$state()` | Reactive state | `let docs = $state([])` |
| `$derived()` | Computed values | `let count = $derived(() => docs.length)` |
| `$effect()` | Side effects | `$effect(() => { console.log(docs) })` |
| `$props()` | Component props | `let { title } = $props()` |
| `$bindable()` | Two-way binding | `let value = $bindable()` |
| `$inspect()` | Development debugging | `$inspect(complexState)` |

---

## State Management

### Basic State

```svelte
<script>
  // Always use 'let' with $state(), never 'const'
  let legalCases = $state([]);
  let selectedCase = $state(null);
  let analysisMode = $state('risk-assessment');
</script>
```

### Complex State Objects

```svelte
<script>
  let evidenceCanvas = $state({
    nodes: [],
    connections: [],
    selectedItems: new Set(),
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  // Reactivity works on nested properties
  function addEvidence(evidence) {
    evidenceCanvas.nodes.push(evidence);
  }
</script>
```

### State with Classes

```svelte
<script>
  class LegalAnalysisEngine {
    constructor() {
      this.documents = $state([]);
      this.isProcessing = $state(false);
    }

    async analyzeDocument(doc) {
      this.isProcessing = true;
      // Analysis logic here
      this.isProcessing = false;
    }
  }

  let engine = $state(new LegalAnalysisEngine());
</script>
```

---

## Reactivity & Effects

### Derived State

```svelte
<script>
  let legalDocuments = $state([]);

  // Simple derived value
  let documentCount = $derived(() => legalDocuments.length);

  // Complex derived computation
  let riskSummary = $derived(() => {
    return legalDocuments.reduce((summary, doc) => {
      summary[doc.riskLevel] = (summary[doc.riskLevel] || 0) + 1;
      return summary;
    }, {});
  });

  // Use $derived.by for complex logic
  let complianceReport = $derived.by(() => {
    const highRiskDocs = legalDocuments.filter(d => d.riskLevel === 'high');
    const recommendations = generateRecommendations(highRiskDocs);
    return { highRiskDocs, recommendations };
  });
</script>
```

### Effects for Side Effects

```svelte
<script>
  let currentDocument = $state(null);
  let analysisResults = $state(null);

  // Effect runs when currentDocument changes
  $effect(() => {
    if (currentDocument) {
      console.log(`Analyzing document: ${currentDocument.title}`);
      // Trigger analysis service
      analyzeDocument(currentDocument);
    }
  });

  // Effect with cleanup
  $effect(() => {
    const websocket = new WebSocket('ws://localhost:8080/legal-updates');

    websocket.onmessage = (event) => {
      const update = JSON.parse(event.data);
      handleLegalUpdate(update);
    };

    // Cleanup function
    return () => {
      websocket.close();
    };
  });
</script>
```

---

## Component Props

### Basic Props

```svelte
<script>
  // Props are reactive by default
  let {
    legalCase,
    analysisMode = 'standard',
    onAnalysisComplete
  } = $props();

  // Derived from props
  let caseTitle = $derived(() => legalCase?.title || 'Untitled Case');
</script>
```

### Bindable Props (Two-way binding)

```svelte
<!-- Parent Component -->
<script>
  let selectedEvidence = $state(null);
</script>

<EvidenceSelector bind:selected={selectedEvidence} />

<!-- EvidenceSelector.svelte -->
<script>
  let { selected = $bindable() } = $props();

  function selectEvidence(evidence) {
    selected = evidence; // Updates parent component
  }
</script>
```

### Advanced Props with Types

```svelte
<script lang="ts">
  interface Props {
    legalDocument: LegalDocument;
    analysisMode?: 'quick' | 'deep' | 'compliance';
    onRiskAssessment?: (assessment: RiskAssessment) => void;
    children?: Snippet;
  }

  let {
    legalDocument,
    analysisMode = 'quick',
    onRiskAssessment,
    children
  }: Props = $props();
</script>
```

---

## Event Handling

### Standard Events

```svelte
<script>
  let documents = $state([]);

  function handleDocumentUpload(event) {
    const files = event.target.files;
    // Process legal document upload
    processLegalDocuments(files);
  }

  function handleAnalysisClick() {
    // Trigger legal analysis
    startLegalAnalysis();
  }
</script>

<input type="file" onchange={handleDocumentUpload} multiple />
<button onclick={handleAnalysisClick}>Analyze Documents</button>
```

### Custom Events

```svelte
<!-- Child Component -->
<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  function notifyRiskDetected(riskData) {
    dispatch('riskDetected', riskData);
  }
</script>

<!-- Parent Component -->
<LegalAnalyzer
  on:riskDetected={(event) => {
    console.log('Risk detected:', event.detail);
    handleHighRisk(event.detail);
  }}
/>
```

---

## Legal AI Platform Patterns

### XState Integration

```svelte
<script>
  import xstateIntegration from '$lib/services/xstate-integration';

  let machineState = $state(null);

  $effect(() => {
    // Subscribe to XState machine updates
    const subscription = xstateIntegration.subscribe('legalAnalysis', (state) => {
      machineState = state;
    });

    return () => subscription.unsubscribe();
  });

  function triggerAnalysis() {
    xstateIntegration.sendEvent('legalAnalysis', {
      type: 'START_ANALYSIS',
      payload: { documentId: currentDocument.id }
    });
  }
</script>
```

### WebGPU Integration

```svelte
<script>
  import { WebGPUTextureStreaming } from '$lib/services/webgpu-texture-streaming';

  let gpuContext = $state(null);
  let tensors = $state([]);

  $effect(() => {
    async function initializeGPU() {
      gpuContext = await WebGPUTextureStreaming.initialize();
    }
    initializeGPU();
  });

  async function processTensors() {
    if (gpuContext) {
      const results = await gpuContext.computeSimilarityMatrix(tensors);
      // Handle GPU computation results
    }
  }
</script>
```

### Evidence Canvas Integration

```svelte
<script>
  import { Fabric } from 'fabric';

  let canvasElement = $state();
  let fabricCanvas = $state(null);
  let evidenceNodes = $state([]);

  $effect(() => {
    if (canvasElement) {
      fabricCanvas = new Fabric.Canvas(canvasElement);

      // Real-time collaboration via WebSocket
      const websocket = new WebSocket('ws://localhost:8080/canvas-sync');
      websocket.onmessage = (event) => {
        const update = JSON.parse(event.data);
        syncCanvasUpdate(update);
      };

      return () => {
        fabricCanvas.dispose();
        websocket.close();
      };
    }
  });

  function addEvidenceNode(evidence) {
    evidenceNodes.push(evidence);
    // Update fabric canvas
    renderEvidenceOnCanvas(evidence);
  }
</script>

<canvas bind:this={canvasElement}></canvas>
```

### Go Microservices Integration

```svelte
<script>
  import { productionServiceClient } from '$lib/api/production-service-client';

  let serviceHealth = $state({});
  let apiResponse = $state(null);

  // Check health of all 37 microservices
  $effect(() => {
    async function checkHealth() {
      try {
        const health = await productionServiceClient.makeRequest('/health/status');
        serviceHealth = health;
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }

    const interval = setInterval(checkHealth, 30000);
    checkHealth(); // Initial check

    return () => clearInterval(interval);
  });
</script>
```

---

## Best Practices

### 1. State Organization

```svelte
<script>
  // Group related state together
  let ui = $state({
    isLoading: false,
    selectedTab: 'documents',
    sidebarOpen: true
  });

  let legal = $state({
    documents: [],
    currentCase: null,
    analysisResults: null
  });

  let canvas = $state({
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });
</script>
```

### 2. Performance Optimization

```svelte
<script>
  let largeDataset = $state([]);

  // Use derived for expensive computations
  let filteredData = $derived(() => {
    // Only recomputes when largeDataset changes
    return largeDataset.filter(item => item.isActive);
  });

  // Avoid creating new objects in templates
  let styles = $derived(() => ({
    color: isHighRisk ? 'red' : 'green',
    fontWeight: isImportant ? 'bold' : 'normal'
  }));
</script>

<div style={Object.entries(styles).map(([k, v]) => `${k}: ${v}`).join('; ')}>
  Content here
</div>
```

### 3. Error Handling

```svelte
<script>
  let error = $state(null);
  let data = $state(null);

  async function loadData() {
    try {
      error = null;
      data = await fetchLegalData();
    } catch (err) {
      error = err.message;
      console.error('Data loading failed:', err);
    }
  }
</script>

{#if error}
  <div class="error">Error: {error}</div>
{:else if data}
  <DataDisplay {data} />
{:else}
  <div class="loading">Loading...</div>
{/if}
```

### 4. TypeScript Integration

```typescript
// src/lib/types/legal.ts
export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  riskLevel: 'low' | 'medium' | 'high';
  analysisResults?: RiskAssessment;
}

export interface RiskAssessment {
  score: number;
  factors: string[];
  recommendations: string[];
}
```

```svelte
<script lang="ts">
  import type { LegalDocument, RiskAssessment } from '$types/legal';

  interface Props {
    documents: LegalDocument[];
    onRiskAssessment: (doc: LegalDocument, assessment: RiskAssessment) => void;
  }

  let { documents, onRiskAssessment }: Props = $props();
</script>
```

### 5. Component Composition

```svelte
<!-- LegalWorkspace.svelte -->
<script>
  let selectedDocument = $state(null);
  let analysisResults = $state(null);
</script>

<div class="legal-workspace">
  <DocumentList
    bind:selected={selectedDocument}
    onAnalyze={analyzeDocument}
  />

  <DocumentViewer
    document={selectedDocument}
    {analysisResults}
  />

  <EvidenceCanvas
    document={selectedDocument}
    onNodeCreate={createEvidenceNode}
  />
</div>
```

---

## Migration from Svelte 4

If migrating components from Svelte 4:

```svelte
<!-- Svelte 4 -->
<script>
  export let document;
  let isAnalyzing = false;

  $: riskLevel = document?.riskScore > 0.7 ? 'high' : 'low';
</script>

<!-- Svelte 5 -->
<script>
  let { document } = $props();
  let isAnalyzing = $state(false);

  let riskLevel = $derived(() =>
    document?.riskScore > 0.7 ? 'high' : 'low'
  );
</script>
```

---

This guide provides the foundation for building sophisticated legal AI components using Svelte 5's powerful runes system, integrated with our platform's advanced features like XState coordination, WebGPU acceleration, and multi-service architecture.