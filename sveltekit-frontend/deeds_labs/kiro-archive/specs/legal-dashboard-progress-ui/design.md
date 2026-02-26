# Design Document: Legal Dashboard with Real-Time Document Processing Progress UI

## Overview

The Legal Dashboard is a professional, courthouse-themed interface that displays real-time document processing progress during evidence ingestion. It integrates with the existing YoRHa noir-beige theme while adopting formal judicial aesthetics (burgundy, navy, bronze). The dashboard provides streaming status updates for multi-stage document parsing with visual progress indicators, per-page thumbnails, and fallback alerts. The architecture uses Svelte 5 components, Uno.css styling, SSE/WebSocket for real-time updates, and integrates with the Go gRPC Gateway backend.

## Architecture

### High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit 5)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Legal Dashboard Page (+page.svelte)                     │   │
│  │  ├─ ProgressCard.svelte                                 │   │
│  │  ├─ DocumentThumbnailTray.svelte                        │   │
│  │  ├─ FallbackAlert.svelte                                │   │
│  │  └─ CourthroomProgress.css (theme integration)          │   │
│  └──────────────────────────────────────────────────────────┘   │
│         ↑                                                        │
│         │ SSE/WebSocket                                         │
│         │                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Stores (Svelte 5 $state)                               │   │
│  │  ├─ SSEStatusStore.ts (connection management)           │   │
│  │  ├─ DocumentProgressStore.ts (progress state)           │   │
│  │  └─ GrpcStatusAdapter.ts (event normalization)          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ↑
         │ HTTP/WebSocket
         │
┌─────────────────────────────────────────────────────────────────┐
│              Go gRPC Gateway (Backend)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /api/document-processing/stream (SSE endpoint)         │   │
│  │  ├─ Receives events from Python workers                 │   │
│  │  ├─ Normalizes event format                             │   │
│  │  └─ Streams to frontend                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ↑
         │ gRPC/RPC
         │
┌─────────────────────────────────────────────────────────────────┐
│           Python Workers + Processing Pipeline                  │
│  ├─ ImageMagick Preprocessing                                  │
│  ├─ Real-ESRGAN Enhancement                                    │
│  ├─ SAM Segmentation                                           │
│  ├─ Granite-Docling Parser (GPU)                              │
│  └─ Tesseract Fallback (CPU)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
LegalDashboard (+page.svelte)
├── ProgressCard
│   ├── ProgressBar
│   ├── StageIndicator
│   ├── PageCounter
│   ├── ETADisplay
│   └── DetailsText
├── DocumentThumbnailTray
│   ├── PageThumbnail (repeated)
│   │   ├── StatusIcon
│   │   └── PageTooltip
│   └── CompletionIndicator
├── FallbackAlert (conditional)
│   ├── WarningIcon
│   ├── AlertMessage
│   └── RetryButton
└── CourthroomProgress.css (styling)
```

## Components and Interfaces

### 1. ProgressCard.svelte

**Purpose**: Main progress display showing current parsing stage, percentage, ETA, and details.

**Props**:
```typescript
interface ProgressCardProps {
  documentTitle: string;           // e.g., "Evidence Document 001"
  currentStage: string;            // e.g., "granite_docling"
  percentage: number;              // 0-100
  eta: number;                     // seconds remaining
  currentPage: number;             // current page number
  totalPages: number;              // total page count
  details: string;                 // e.g., "1 stamp, 3 tables, 42 text blocks"
  isProcessing: boolean;           // true if actively processing
}
```

**Styling**:
- Background: `var(--beige)` with subtle border
- Header: Serif font (Merriweather) in `var(--noir)`
- Progress bar: `var(--bronze)` filled, `var(--navy)` at 20% opacity background
- Text: Sans-serif (Inter) in `var(--noir)`
- Metadata: Monospace (JetBrains Mono) in smaller font

**Behavior**:
- Updates progress bar smoothly every 500ms
- Displays stage name with human-readable label
- Shows page counter (e.g., "Page 4/12")
- Displays ETA in MM:SS format
- Shows detailed status in smaller text below progress bar

### 2. DocumentThumbnailTray.svelte

**Purpose**: Horizontal strip showing per-page processing status.

**Props**:
```typescript
interface DocumentThumbnailTrayProps {
  pages: PageStatus[];             // array of page statuses
  totalPages: number;              // total page count
}

interface PageStatus {
  pageNumber: number;
  status: 'complete' | 'processing' | 'pending' | 'error';
  stage?: string;                  // current stage for this page
  timestamp?: Date;                // completion time
  errorMessage?: string;           // error details if failed
}
```

**Styling**:
- Layout: Horizontal flex with fixed width per page
- Status indicators: Color-coded (green ✓, yellow ..., gray pending, red ✗)
- Hover: Show tooltip with page number and stage
- Responsive: Stack vertically on mobile

**Behavior**:
- Display page number with status icon
- Update status as pages complete
- Show tooltip on hover with details
- Allow click to view error details
- Display completion timestamp when done

### 3. FallbackAlert.svelte

**Purpose**: Warning alert when GPU processing fails and CPU fallback activates.

**Props**:
```typescript
interface FallbackAlertProps {
  isActive: boolean;               // show/hide alert
  confidence: number;              // 0-1 confidence level
  message: string;                 // fallback message
  onRetry?: () => void;            // retry callback
}
```

**Styling**:
- Background: `var(--court-red)` with opacity
- Icon: Warning symbol (⚠)
- Text: `var(--noir)` on red background
- Button: Bronze accent with hover effect

**Behavior**:
- Display when fallback event received
- Show confidence level
- Provide "Retry with GPU" button
- Dismiss when GPU becomes available
- Log fallback event for debugging

### 4. CourthroomProgress.css

**Purpose**: Styling module extending theme.css with courthouse colors and professional aesthetics.

**Key Styles**:
```css
:root {
  --navy: #1a3a52;
  --court-red: #8b3a3a;
  --bronze: #b8860b;
}

.progress-card {
  background: var(--beige);
  border: 1px solid var(--bronze);
  border-radius: 4px;
  padding: 1.5rem;
  font-family: 'Inter', sans-serif;
}

.progress-bar {
  background: var(--navy);
  opacity: 0.2;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fill {
  background: var(--bronze);
  height: 100%;
  transition: width 0.3s ease;
}

.stage-label {
  font-family: 'Merriweather', serif;
  color: var(--noir);
  font-size: 1.125rem;
  font-weight: 600;
}

.metadata {
  font-family: 'JetBrains Mono', monospace;
  color: var(--noir);
  font-size: 0.875rem;
}

.fallback-alert {
  background: var(--court-red);
  color: var(--noir);
  padding: 1rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 1rem;
}
```

## Data Models

### Event Format (from Go gRPC Gateway)

```typescript
interface ProcessingEvent {
  stage: 'imagemagick' | 'esrgan' | 'sam' | 'granite_docling' | 'tesseract_fallback';
  status: string;                  // e.g., "Parsing document layout"
  page: number;                    // current page
  pages_total: number;             // total pages
  percent: number;                 // 0-100
  eta: number;                     // seconds remaining
  details: string;                 // legal-specific details
  timestamp: string;               // ISO 8601
  confidence?: number;             // for fallback events
}
```

### Progress State (Svelte Store)

```typescript
interface ProgressState {
  documentId: string;
  documentTitle: string;
  isProcessing: boolean;
  currentEvent: ProcessingEvent | null;
  pageStatuses: Map<number, PageStatus>;
  fallbackActive: boolean;
  fallbackConfidence: number;
  errors: ProcessingError[];
  startTime: Date;
  completionTime?: Date;
}

interface PageStatus {
  pageNumber: number;
  status: 'complete' | 'processing' | 'pending' | 'error';
  stage?: string;
  timestamp?: Date;
  errorMessage?: string;
}

interface ProcessingError {
  timestamp: Date;
  stage: string;
  message: string;
  recoverable: boolean;
}
```

## Error Handling

### Connection Errors

**Scenario**: SSE connection drops
- **Handling**: Attempt reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **UI**: Show "Connection lost, reconnecting..." message
- **Recovery**: Auto-reconnect when connection restored

### Processing Errors

**Scenario**: Granite-Docling GPU processing fails
- **Handling**: Emit fallback event, switch to Tesseract
- **UI**: Display FallbackAlert with confidence level
- **Recovery**: Offer "Retry with GPU" button

### Parsing Errors

**Scenario**: Event JSON parsing fails
- **Handling**: Log error, skip event, continue processing
- **UI**: No user-facing error (silent failure)
- **Logging**: Send to error tracking service

### Timeout Errors

**Scenario**: Processing takes longer than expected
- **Handling**: Display timeout message after 5 minutes
- **UI**: Show "Processing taking longer than expected" message
- **Recovery**: Allow user to cancel or continue waiting

## Testing Strategy

### Unit Tests

1. **ProgressCard Component**
   - Test percentage calculation
   - Test ETA formatting (MM:SS)
   - Test stage label mapping
   - Test responsive layout

2. **DocumentThumbnailTray Component**
   - Test page status rendering
   - Test status icon display
   - Test tooltip content
   - Test error handling

3. **FallbackAlert Component**
   - Test alert visibility
   - Test confidence display
   - Test retry callback
   - Test dismissal

4. **Stores**
   - Test SSE connection establishment
   - Test event parsing
   - Test state updates
   - Test error handling

### Integration Tests

1. **End-to-End Processing**
   - Start document processing
   - Verify progress updates
   - Verify page thumbnails update
   - Verify completion

2. **Fallback Scenario**
   - Trigger GPU failure
   - Verify fallback alert appears
   - Verify Tesseract processing continues
   - Verify retry option works

3. **Error Recovery**
   - Simulate connection drop
   - Verify reconnection
   - Verify state recovery
   - Verify UI updates

### Performance Tests

1. **Update Frequency**
   - Verify updates every 500ms-1s
   - Verify no excessive re-renders
   - Verify smooth animations

2. **Memory Usage**
   - Verify no memory leaks
   - Verify store cleanup on unmount
   - Verify event listener cleanup

## Styling and Theme Integration

### Color Palette

| Element | Color | CSS Variable |
|---------|-------|--------------|
| Primary Text | Dark Gray | `var(--noir)` |
| Background | Beige | `var(--beige)` |
| Progress Fill | Bronze | `var(--bronze)` |
| Progress Background | Navy (20% opacity) | `var(--navy)` |
| Alert Background | Burgundy | `var(--court-red)` |
| Borders | Bronze | `var(--bronze)` |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Headings | Merriweather (serif) | 1.125rem | 600 |
| Body Text | Inter (sans-serif) | 1rem | 400 |
| Metadata | JetBrains Mono (monospace) | 0.875rem | 400 |
| Status | Inter (sans-serif) | 0.875rem | 400 |

### Responsive Breakpoints

| Breakpoint | Width | Layout |
|-----------|-------|--------|
| Mobile (sm) | <640px | Stacked vertically |
| Tablet (md) | 640-1024px | Progress above tray |
| Desktop (lg) | >1024px | Progress left, tray top-right |

## Implementation Considerations

### Performance Optimization

1. **Debounce Updates**: Batch SSE events to prevent excessive re-renders
2. **Lazy Loading**: Load page thumbnails on demand
3. **Memory Management**: Clean up event listeners on component unmount
4. **CSS Optimization**: Use CSS variables for theme switching

### Accessibility

1. **ARIA Labels**: Add aria-label to progress bar and status indicators
2. **Keyboard Navigation**: Support Tab and Enter for interactive elements
3. **Color Contrast**: Ensure WCAG AA compliance for all text
4. **Screen Reader**: Provide text alternatives for icons

### Browser Compatibility

1. **SSE Support**: All modern browsers (IE11 requires polyfill)
2. **CSS Variables**: All modern browsers (IE11 not supported)
3. **Svelte 5**: Latest browsers with ES2020+ support

### Security Considerations

1. **Event Validation**: Validate all incoming events
2. **XSS Prevention**: Sanitize event data before rendering
3. **CSRF Protection**: Use SvelteKit's built-in CSRF protection
4. **Authentication**: Verify user session before streaming

## Integration Points

### With Go gRPC Gateway

- **Endpoint**: `/api/document-processing/stream`
- **Protocol**: Server-Sent Events (SSE) or WebSocket
- **Authentication**: Bearer token in Authorization header
- **Event Format**: JSON with stage, status, page, percent, eta, details

### With Python Workers

- **Communication**: gRPC or RPC to Go gateway
- **Status Callback**: Emit events with processing stage
- **Error Handling**: Send error events on failure
- **Fallback**: Emit fallback event when GPU unavailable

### With YoRHa Theme System

- **Theme Variables**: Reference existing --noir, --beige, --bronze
- **Font Stack**: Use YoRHa serif/sans-serif fonts
- **Color Scheme**: Extend with --navy, --court-red
- **Consistency**: Maintain noir-beige foundation

## Deployment Considerations

### Environment Variables

```
VITE_API_BASE_URL=http://localhost:3000
VITE_SSE_ENDPOINT=/api/document-processing/stream
VITE_RECONNECT_TIMEOUT=30000
VITE_EVENT_DEBOUNCE_MS=500
```

### Build Configuration

- **Framework**: SvelteKit 5
- **CSS**: Uno.css with custom theme
- **Fonts**: Merriweather, Inter, JetBrains Mono (web fonts)
- **Bundle Size**: Optimize for production

### Monitoring

- **Error Tracking**: Send errors to Sentry or similar
- **Performance Metrics**: Track page load and update latency
- **User Analytics**: Track dashboard usage patterns
- **Health Checks**: Monitor SSE connection health

