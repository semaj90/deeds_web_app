# Canvas Integration Guide <�

This guide demonstrates how to integrate and use the Enhanced Evidence Canvas with the YoRHa Legal
AI Platform.

## Overview

The Enhanced Evidence Canvas is a comprehensive Fabric.js-based interactive canvas that combines:

- **Drag & Drop File Upload** with CUDA acceleration
- **Enhanced Ingestion Pipeline** with multimodal AI processing
- **Detective Analysis Engine** with pattern recognition
- **Real-time Progress Tracking** with N64-style aesthetics
- **Interactive Anchor Points** for evidence visualization

## Quick Start

### 1. Basic Integration

```svelte
<script>
  import { EvidenceCanvas } from '$lib/ui/enhanced/EvidenceCanvas.svelte';

  let caseId = 'case-12345';
</script>

<EvidenceCanvas
  {caseId}
  enableDragDrop={true}
  enableCUDAAcceleration={true}
  enableN64Style={true}
  maxFileSize={100 * 1024 * 1024}
  acceptedTypes={['image/*', 'application/pdf', 'text/*', '.docx']}
/>
```

### 2. Advanced Configuration

```svelte
<EvidenceCanvas
  caseId="evidence-case-001"
  enableDragDrop={true}
  enableGPUProcessing={true}
  enableCUDAAcceleration={true}
  enableN64Style={true}
  maxFileSize={250 * 1024 * 1024}
  acceptedTypes={[
    'image/*',
    'application/pdf',
    'text/*',
    '.docx',
    '.xlsx',
    'video/mp4',
    'audio/wav',
  ]}
  on:fileUploaded={handleFileUploaded}
  on:analysisComplete={handleAnalysisComplete}
  on:detectiveInsights={handleDetectiveInsights}
/>
```

## Features

### <� Drag & Drop Upload

- **Position-aware drops**: Files dropped on specific canvas locations are placed precisely
- **Multi-file support**: Drag multiple files simultaneously
- **Type validation**: Only accepts specified file types
- **Size limits**: Configurable maximum file sizes
- **Visual feedback**: N64-style drag overlay with retro animations

### � CUDA Acceleration

- **GPU preprocessing**: Automatic CUDA optimization for images and PDFs
- **Performance metrics**: Real-time throughput and processing time display
- **Memory management**: Efficient GPU memory usage with NES-style allocation
- **Fallback handling**: Graceful degradation if CUDA unavailable

### >� Enhanced Ingestion Pipeline

- **Multimodal processing**: Text, image, video, and document analysis
- **Vector embeddings**: Automatic generation for semantic search
- **SOM clustering**: Self-organizing maps for evidence organization
- **RTX compression**: Advanced compression with quality preservation

### =

Detective Analysis Engine

- **Pattern recognition**: Automatic detection of dates, phones, legal terms
- **OCR with handwriting**: Advanced text extraction including handwritten notes
- **Conflict detection**: AI-powered inconsistency identification
- **Legal relevance**: Automatic scoring of evidence importance

### =� Interactive Anchor Points

- **Smart annotation**: AI-generated anchor points for key evidence areas
- **Visual indicators**: Color-coded relevance (high=red, medium=yellow, low=green)
- **Hover tooltips**: Contextual information on evidence details
- **Legal insights**: Detective analysis results overlaid on evidence

## Integration with YoRHa CanvasBoard

### Connecting Components

```svelte
<script>
  import { EvidenceCanvas } from '$lib/ui/enhanced/EvidenceCanvas.svelte';
  import { CanvasBoard } from '$lib/components/yorha/CanvasBoard.svelte';

  let evidenceCanvasRef;
  let canvasBoardRef;

  // Sync canvas states
  function syncCanvasBoards() {
    if (evidenceCanvasRef && canvasBoardRef) {
      // Share canvas objects between components
      const evidenceObjects = evidenceCanvasRef.getCanvasObjects();
      canvasBoardRef.importObjects(evidenceObjects);
    }
  }
</script>

<div class="canvas-integration">
  <EvidenceCanvas bind:this={evidenceCanvasRef} on:canvasUpdated={syncCanvasBoards} />

  <CanvasBoard
    bind:this={canvasBoardRef}
    enableDrawing={true}
    showToolbar={true}
    on:drawingComplete={syncCanvasBoards}
  />
</div>
```

### Shared State Management

```javascript
// Canvas state store
import { writable } from 'svelte/store';

export const canvasState = writable({
  objects: [],
  evidenceFiles: [],
  drawingLayers: [],
  analysisResults: [],
});

// Sync function
export function syncCanvasState(evidenceCanvas, yorhaBoard) {
  canvasState.update((state) => ({
    ...state,
    objects: [...evidenceCanvas.objects, ...yorhaBoard.drawings],
    lastSync: Date.now(),
  }));
}
```

## Event Handling

### Available Events

```svelte
<EvidenceCanvas
  on:fileUploaded={(event) => {
    console.log('File uploaded:', event.detail);
    // { file: File, position: {x, y}, status: 'completed' }
  }}
  on:analysisComplete={(event) => {
    console.log('Analysis complete:', event.detail);
    // { fileId, analysis, confidence, processingTime }
  }}
  on:detectiveInsights={(event) => {
    console.log('Detective insights:', event.detail);
    // { fileId, patterns, conflicts, relevance }
  }}
  on:anchorPointsGenerated={(event) => {
    console.log('Anchor points:', event.detail);
    // { fileId, anchorPoints, confidence }
  }}
  on:canvasUpdated={(event) => {
    console.log('Canvas updated:', event.detail);
    // { objects, canvasJson, timestamp }
  }}
/>
```

### Custom Event Handlers

```javascript
function handleFileUploaded(event) {
  const { file, position, status } = event.detail;

  // Update case evidence database
  updateCaseEvidence({
    caseId: currentCase.id,
    evidenceId: file.id,
    position,
    status,
  });

  // Trigger additional processing
  if (status === 'completed') {
    scheduleEvidenceReview(file.id);
  }
}

function handleDetectiveInsights(event) {
  const { fileId, patterns, conflicts } = event.detail;

  // Alert if high-priority conflicts detected
  if (conflicts.some((c) => c.severity === 'critical')) {
    showConflictAlert(conflicts);
  }

  // Update investigation timeline
  updateInvestigationTimeline(patterns);
}
```

## Styling and Theming

### N64 Style (Retro Gaming Theme)

```css
/* Custom N64 styling */
.evidence-canvas.n64-style {
  --primary-color: #ffd700;
  --secondary-color: #ffa500;
  --background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
  --border: 2px solid #ffd700;

  font-family: 'Courier New', monospace;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.n64-style .file-badge {
  background: #ffd700;
  color: #000;
  font-weight: bold;
  text-shadow: none;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.3);
}
```

### Professional Style (Legal Theme)

```css
.evidence-canvas.professional {
  --primary-color: #2563eb;
  --secondary-color: #1e40af;
  --background: #ffffff;
  --border: 1px solid #e5e7eb;

  font-family: 'Inter', sans-serif;
  color: #374151;
}
```

## API Integration

### Backend Endpoints

The canvas automatically integrates with these API endpoints:

```typescript
// File upload and processing
POST / api / evidence / upload;
GET / api / evidence / { id };
PUT / api / evidence / { id };
DELETE / api / evidence / { id };

// Canvas state management
POST / api / evidence - canvas / save;
GET / api / evidence - canvas / { canvasId };
POST / api / evidence - canvas / analyze;

// Detective analysis
POST / api / detective - analysis / process;
GET / api / detective - analysis / { evidenceId } / results;
```

### Custom API Configuration

```svelte
<script>
  import { EvidenceCanvas } from '$lib/ui/enhanced/EvidenceCanvas.svelte';

  const apiConfig = {
    uploadEndpoint: '/api/v2/evidence/upload',
    analysisEndpoint: '/api/v2/detective/analyze',
    canvasEndpoint: '/api/v2/canvas/state',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'X-Case-ID': caseId,
    },
  };
</script>

<EvidenceCanvas {apiConfig} />
```

## Performance Optimization

### GPU Acceleration Settings

```javascript
const gpuSettings = {
  enableCUDA: true,
  targetArchitecture: 'sm_75', // RTX 3060 Ti
  maxTileSize: 1024,
  compressionLevel: 0.8,
  parallelProcessing: true,
  memoryPoolSize: '2GB',
};
```

### Memory Management

```javascript
// Monitor canvas memory usage
function monitorMemoryUsage() {
  const stats = evidenceCanvas.getMemoryStats();
  console.log('Memory usage:', {
    canvasObjects: stats.objectCount,
    textureMemory: stats.textureMemoryMB,
    fabricMemory: stats.fabricMemoryMB,
    totalMemory: stats.totalMemoryMB,
  });

  // Clean up if memory usage is high
  if (stats.totalMemoryMB > 500) {
    evidenceCanvas.optimizeMemory();
  }
}
```

## Troubleshooting

### Common Issues

1. **CUDA Not Available**

   ```javascript
   // Check CUDA availability
   if (!evidenceCanvas.isCUDAAvailable()) {
     console.warn('CUDA not available, falling back to CPU processing');
     // Disable CUDA features
     evidenceCanvas.setCUDAEnabled(false);
   }
   ```

2. **Large File Upload Errors**

   ```javascript
   // Handle large file uploads
   evidenceCanvas.on('uploadError', (event) => {
     if (event.detail.error === 'FILE_TOO_LARGE') {
       showMessage('File too large. Maximum size: 100MB');
       // Offer compression option
       offerFileCompression(event.detail.file);
     }
   });
   ```

3. **Canvas Performance Issues**
   ```javascript
   // Optimize canvas performance
   evidenceCanvas.setPerformanceMode('high');
   evidenceCanvas.enableObjectCaching(true);
   evidenceCanvas.setRenderOnAddRemove(false);
   ```

### Debug Mode

```svelte
<EvidenceCanvas debugMode={true} showPerformanceMetrics={true} logLevel="verbose" />
```

## Best Practices

1. **File Organization**: Use descriptive file names and organize by evidence type
2. **Memory Management**: Regularly clean up unused canvas objects
3. **Performance**: Enable CUDA for large files, use appropriate tile sizes
4. **User Experience**: Provide clear feedback during processing
5. **Security**: Validate all uploads, sanitize file names
6. **Accessibility**: Include alt text for images, keyboard navigation

## Examples

### Complete Integration Example

See the full example in `/src/routes/evidence-canvas/+page.svelte` for a complete implementation
including:

- File upload handling
- Real-time progress tracking
- Detective analysis integration
- Canvas state management
- Error handling
- Performance optimization

---

_This guide covers the basic integration of the Enhanced Evidence Canvas. For advanced use cases and
custom implementations, refer to the component source code and API documentation._
