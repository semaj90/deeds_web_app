# Phase 10: Frontend Visualization - Design Document

## Overview

Phase 10 implements the visual frontend for the Advanced Multimodal Retriever Engine, transforming backend retrieval results into an immersive 3D Memory Palace. The system loads CH-ROM97 cartridges from Phase 7, renders glyph cards in 3D space using WebGL/Three.js, and provides interactive navigation with semantic path visualization. The architecture prioritizes performance (<300ms latency), scalability (1000+ documents), and responsive design across devices.

## Architecture

### High-Level Flow

```
User Query
    ↓
FastAPI Backend (Phase 9)
    ↓
CH-ROM97 Cartridge (Phase 7)
    ↓
Frontend Loader
    ├─ Parse Binary Format
    ├─ Extract Manifold Data
    └─ Load Textures
    ↓
WebGL Renderer
    ├─ Glyph Card Rendering
    ├─ Semantic Path Rendering
    └─ Level-of-Detail System
    ↓
Interactive 3D Scene
    ├─ Camera Controls
    ├─ Filtering & Search
    └─ Detail Panels
```

### Component Architecture

```
Frontend Layer
├─ UI Components (Svelte)
│  ├─ SearchPanel
│  ├─ FilterPanel
│  ├─ DetailPanel
│  └─ ControlsPanel
├─ 3D Rendering (Three.js)
│  ├─ SceneManager
│  ├─ GlyphCardRenderer
│  ├─ SemanticPathRenderer
│  └─ CameraController
├─ Data Management
│  ├─ CartridgeLoader
│  ├─ ResultCache
│  └─ StateManager
└─ API Integration
   ├─ BackendClient
   ├─ ErrorHandler
   └─ RequestManager
```

## Components and Interfaces

### 1. CartridgeLoader

**Purpose**: Parse CH-ROM97 binary format and extract 3D scene data

**Interface**:
```typescript
interface CartridgeLoader {
  loadCartridge(buffer: ArrayBuffer): Promise<CartridgeData>
  parseHeader(buffer: ArrayBuffer): CartridgeHeader
  extractManifold(buffer: ArrayBuffer): Float32Array
  extractTextures(buffer: ArrayBuffer): TextureData[]
  extractMetadata(buffer: ArrayBuffer): DocumentMetadata[]
}

interface CartridgeData {
  header: CartridgeHeader
  manifold: Float32Array  // 4D positions
  textures: TextureData[]
  metadata: DocumentMetadata[]
  graph: GraphData
}
```

### 2. SceneManager

**Purpose**: Manage Three.js scene, camera, and rendering pipeline

**Interface**:
```typescript
interface SceneManager {
  initialize(canvas: HTMLCanvasElement): void
  addGlyphCard(card: GlyphCard): void
  addSemanticPath(path: SemanticPath): void
  render(): void
  dispose(): void

  // Level-of-detail
  updateLOD(cameraPosition: Vector3): void

  // Performance monitoring
  getFrameStats(): FrameStats
}

interface GlyphCard {
  id: string
  position: Vector3
  metadata: DocumentMetadata
  texture: Texture
  relevanceScore: number
}

interface SemanticPath {
  id: string
  source: string
  target: string
  type: string
  confidence: number
  metadata: RelationshipMetadata
}
```

### 3. GlyphCardRenderer

**Purpose**: Render individual document cards with interactive features

**Interface**:
```typescript
interface GlyphCardRenderer {
  createCard(data: GlyphCard): Object3D
  updateCardState(cardId: string, state: CardState): void
  highlightCard(cardId: string): void
  dimCard(cardId: string): void
  showTooltip(cardId: string, position: Vector2): void
  hideTooltip(): void
}

enum CardState {
  NORMAL = 'normal',
  HIGHLIGHTED = 'highlighted',
  DIMMED = 'dimmed',
  SELECTED = 'selected'
}
```

### 4. SemanticPathRenderer

**Purpose**: Render connections between documents with metadata

**Interface**:
```typescript
interface SemanticPathRenderer {
  createPath(path: SemanticPath): Object3D
  updatePathStyle(pathId: string, style: PathStyle): void
  animatePath(pathId: string, duration: number): void
  showPathMetadata(pathId: string, position: Vector2): void
  bundlePaths(paths: SemanticPath[]): BundledPath[]
}

interface PathStyle {
  color: Color
  lineWidth: number
  dashPattern?: number[]
  animated: boolean
}
```

### 5. CameraController

**Purpose**: Handle user input and camera navigation

**Interface**:
```typescript
interface CameraController {
  onMouseMove(event: MouseEvent): void
  onMouseWheel(event: WheelEvent): void
  onKeyDown(event: KeyboardEvent): void
  focusOnCard(cardId: string): Promise<void>
  resetView(): Promise<void>

  // Smooth animations
  animateTo(target: Vector3, duration: number): Promise<void>
}
```

### 6. FilterManager

**Purpose**: Handle filtering and search within the visualization

**Interface**:
```typescript
interface FilterManager {
  setSearchTerm(term: string): void
  setDocumentTypeFilter(types: string[]): void
  setRelevanceRange(min: number, max: number): void
  applyFilters(): void
  clearFilters(): void

  // State
  getActiveFilters(): FilterState
  getFilteredCards(): GlyphCard[]
}

interface FilterState {
  searchTerm: string
  documentTypes: string[]
  relevanceRange: [number, number]
  relationshipTypes: string[]
}
```

### 7. BackendClient

**Purpose**: Communicate with FastAPI backend

**Interface**:
```typescript
interface BackendClient {
  search(query: string): Promise<SearchResult>
  getDocumentDetails(docId: string): Promise<DocumentDetails>
  getRelationships(docId: string): Promise<Relationship[]>
  getCartridge(queryId: string): Promise<ArrayBuffer>

  // Error handling
  setErrorHandler(handler: ErrorHandler): void
  setTimeout(ms: number): void
}

interface SearchResult {
  queryId: string
  cartridgeUrl: string
  metadata: DocumentMetadata[]
  relationships: Relationship[]
  stats: SearchStats
}
```

## Data Models

### CartridgeHeader
```typescript
interface CartridgeHeader {
  version: string
  flags: number
  runeCount: number
  tileCount: number
  tensorSize: number
  latentSize: number
  graphNodes: number
  manifoldDim: number
}
```

### DocumentMetadata
```typescript
interface DocumentMetadata {
  id: string
  title: string
  type: string
  relevanceScore: number
  snippet: string
  source: string
  timestamp: number
  manifoldPosition: Vector4
  glyphColor: Color
}
```

### Relationship
```typescript
interface Relationship {
  id: string
  sourceId: string
  targetId: string
  type: string
  confidence: number
  reasoning: string
  evidence: string[]
}
```

### FrameStats
```typescript
interface FrameStats {
  fps: number
  renderTime: number
  updateTime: number
  drawCalls: number
  triangles: number
  memoryUsage: number
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Cartridge Parsing Round-Trip

*For any* valid CH-ROM97 cartridge binary buffer, parsing the buffer and extracting manifold positions, textures, and metadata should produce data structures that can be re-serialized to produce an equivalent binary representation.

**Validates: Requirements 5.1**

### Property 2: Spatial Similarity Ordering

*For any* set of documents with semantic similarity scores from the manifold projection, when rendered as glyph cards in 3D space, the Euclidean distance between any two cards should be inversely correlated with their similarity score—higher similarity should result in closer positioning.

**Validates: Requirements 1.2**

### Property 3: Filter Spatial Invariance

*For any* filter state (search term, document type, relevance range) applied to the visualization, the 3D positions of visible glyph cards should remain unchanged—filtering should only affect visibility, not spatial positioning.

**Validates: Requirements 4.4**

### Property 4: Query-to-Render Latency

*For any* search query submitted to the system, the time from query submission to initial 3D scene render should be less than 300 milliseconds, and the system should maintain at least 30 FPS during interactive camera movement with 50+ documents visible.

**Validates: Requirements 1.1, 1.5**

### Property 5: Viewport Responsive Consistency

*For any* viewport size change (resize, orientation change), the WebGL canvas aspect ratio should be updated to match the new viewport, and all UI elements should reflow without visual artifacts or loss of interactivity.

**Validates: Requirements 6.1, 6.5**

### Property 6: API Error Graceful Degradation

*For any* backend API error (timeout, 4xx, 5xx, connection loss), the system should display a user-friendly error message and offer recovery options (retry, cached results) without crashing, losing user state, or interrupting the current visualization.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 7: Touch Input Functional Equivalence

*For any* interaction possible with mouse/keyboard input (pan, zoom, select, filter), the same interaction should be achievable with touch input (pinch, two-finger pan, tap) on mobile devices with equivalent functionality and performance characteristics.

**Validates: Requirements 6.2, 6.3**

### Property 8: Semantic Path Rendering Correctness

*For any* relationship in the backend data with source document A and target document B, a corresponding semantic path should be rendered in the visualization connecting the glyph cards for A and B with correct metadata (type, confidence, reasoning) displayed along the path.

**Validates: Requirements 2.1, 2.3, 7.1**

### Property 9: Tooltip Content Completeness

*For any* glyph card in the visualization, when the user hovers over it, a tooltip should appear containing the document title, relevance score, and snippet text without interrupting the 3D view or other interactive elements.

**Validates: Requirements 1.3**

### Property 10: Detail Panel Non-Interruption

*For any* glyph card clicked by the user, a detail panel should appear displaying full document details while the 3D scene remains interactive and responsive to camera controls and other interactions.

**Validates: Requirements 1.4**

### Property 11: Path Bundling Visual Clarity

*For any* set of multiple semantic paths between the same pair of documents, the system should bundle them visually to reduce clutter while maintaining the ability to interact with individual paths and display their metadata.

**Validates: Requirements 2.4**

### Property 12: Relationship Type Filtering

*For any* relationship type filter applied by the user, only semantic paths matching the selected relationship types should be visible, while all glyph cards remain visible and spatial relationships are preserved.

**Validates: Requirements 2.5**

### Property 13: Camera Focus Animation

*For any* glyph card double-clicked by the user, the camera should smoothly animate to focus on that card and its connected neighbors, completing the animation within 1 second without interrupting other interactions.

**Validates: Requirements 3.4**

### Property 14: Camera Reset Consistency

*For any* spacebar press by the user, the camera should reset to the default overview position showing all visible documents in the scene, completing the reset within 500 milliseconds.

**Validates: Requirements 3.5**

### Property 15: Search Term Highlighting

*For any* search term entered in the filter panel, glyph cards with matching titles or snippets should be highlighted, while non-matching cards should be dimmed, and the highlighting should update in real-time as the search term changes.

**Validates: Requirements 4.1**

### Property 16: Document Type Filter Preservation

*For any* document type filter applied by the user, only glyph cards matching the selected types should be visible, while the spatial layout and relationships between visible cards remain unchanged.

**Validates: Requirements 4.2**

### Property 17: Relevance Range Filtering

*For any* relevance score range filter applied by the user, only glyph cards with relevance scores within the specified range should be visible, and the visualization should update dynamically as the range changes.

**Validates: Requirements 4.3**

### Property 18: Filter Clear Fade-In

*For any* filter clear action by the user, all previously hidden glyph cards should become visible with a smooth fade-in animation completing within 500 milliseconds, restoring the full visualization.

**Validates: Requirements 4.5**

### Property 19: GPU Resource Management

*For any* cartridge that is no longer visible in the viewport, its GPU resources (vertex buffers, textures, framebuffers) should be unloaded and freed within 1 second, reducing memory usage without affecting visible content.

**Validates: Requirements 5.4**

### Property 20: Cartridge Preloading

*For any* new query submitted by the user while viewing current results, the next cartridge should be preloaded in the background without interrupting the current visualization or causing frame rate drops.

**Validates: Requirements 5.5**

## Error Handling

### Network Errors
- Timeout: 5-second timeout with retry UI
- Connection Lost: Pause updates, resume on reconnect
- 4xx Errors: Display user-friendly message with suggestions
- 5xx Errors: Offer retry or fallback to cached results

### Rendering Errors
- WebGL Context Loss: Attempt recovery, show fallback UI
- Out of Memory: Reduce LOD, unload non-visible cartridges
- Shader Compilation: Log error, use fallback shader

### Data Errors
- Invalid Cartridge: Show error, offer to re-download
- Corrupted Metadata: Skip corrupted entries, continue rendering
- Missing Textures: Use placeholder textures, log warning

## Testing Strategy

### Unit Testing
- CartridgeLoader: Parse valid/invalid cartridge formats
- FilterManager: Apply/clear filters, verify state consistency
- CameraController: Test camera animations and constraints
- BackendClient: Mock API responses, test error handling

### Property-Based Testing
- **Property 1**: Generate random cartridges, verify round-trip consistency
- **Property 2**: Generate random similarity scores, verify spatial ordering
- **Property 3**: Apply random filters, verify spatial invariance
- **Property 4**: Render scenes with 10-1000 documents, measure performance
- **Property 5**: Resize viewport randomly, verify layout consistency
- **Property 6**: Simulate API errors, verify graceful degradation
- **Property 7**: Generate touch events, verify equivalence to mouse events
- **Property 8**: Generate relationships, verify path rendering

### Integration Testing
- End-to-end query flow: Search → Cartridge Load → Render → Interact
- Multi-device testing: Desktop, tablet, mobile
- Performance benchmarks: Latency, FPS, memory usage
- Accessibility testing: Keyboard navigation, screen reader support

### Testing Framework
- **Unit Tests**: Vitest with jsdom for DOM testing
- **Property Tests**: fast-check for property-based testing
- **E2E Tests**: Playwright for browser automation
- **Performance Tests**: Lighthouse, WebPageTest

### Test Configuration
- Minimum 100 iterations for property-based tests
- Target 60 FPS for rendering tests
- <300ms latency for query-to-render pipeline
- <50MB memory usage for 1000-document scenes

