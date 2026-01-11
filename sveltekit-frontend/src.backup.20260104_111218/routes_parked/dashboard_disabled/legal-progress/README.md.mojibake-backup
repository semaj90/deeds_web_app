# Legal Dashboard with Real-Time Document Processing Progress UI

## Overview

The Legal Dashboard is a professional, courthouse-themed interface that displays real-time document processing progress during evidence ingestion. It integrates with the existing YoRHa noir-beige theme while adopting formal judicial aesthetics (burgundy, navy, bronze).

## Features

### 🎨 Professional Courthouse Styling
- Serif headings (Merriweather, Spectral, Playfair Display)
- Sans-serif body text (Inter, Source Sans, Roboto)
- Monospace code (JetBrains Mono)
- Judicial color palette: burgundy, navy, bronze, gold accents
- Maintains YoRHa noir-beige foundation

### 📊 Real-Time Progress Display
- **ProgressCard Component**: Shows current parsing stage, percentage, ETA, and document metadata
- **DocumentThumbnailTray**: Per-page status indicators (✓ complete, ... processing, ○ pending, ✗ error)
- **FallbackAlert**: Warning notifications when GPU processing fails and CPU fallback activates

### 🛰️ Streaming Architecture
- **SSE/WebSocket Integration**: Real-time status updates from Go gRPC Gateway
- **Event Normalization**: GrpcStatusAdapter for consistent data format
- **Automatic Reconnection**: Exponential backoff retry logic

### ⚠️ Fallback Handling
- GPU failure detection and CPU fallback activation
- Confidence level display
- Retry with GPU option
- Evidence preservation during fallback

### ♿ Accessibility
- ARIA labels and semantic HTML
- WCAG AA color contrast compliance
- Keyboard navigation support
- Screen reader announcements
- Reduced motion support

## Project Structure

```
sveltekit-frontend/
├── src/
│   ├── lib/
│   │   ├── components/dashboard/
│   │   │   ├── ProgressCard.svelte          # Main progress display
│   │   │   ├── DocumentThumbnailTray.svelte # Page status indicators
│   │   │   └── FallbackAlert.svelte         # GPU fallback alert
│   │   ├── stores/dashboard/
│   │   │   ├── SSEStatusStore.ts            # SSE connection management
│   │   │   ├── DocumentProgressStore.ts     # Progress state management
│   │   │   └── GrpcStatusAdapter.ts         # Event normalization
│   │   ├── services/dashboard/
│   │   │   └── DocumentProcessingAPI.ts     # Backend API client
│   │   └── utils/dashboard/
│   │       ├── ErrorHandler.ts              # Error handling utilities
│   │       └── Accessibility.ts             # Accessibility utilities
│   ├── styles/
│   │   └── courthouse-theme.css             # Courthouse color palette & styling
│   └── routes/dashboard/legal-progress/
│       └── +page.svelte                     # Main dashboard page
```

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Import Courthouse Theme

Add to your main app layout or page:

```svelte
<link rel="stylesheet" href="/styles/courthouse-theme.css" />
```

Or import in your Svelte component:

```svelte
<script>
  import '$lib/styles/courthouse-theme.css';
</script>
```

### 3. Configure Environment Variables

Create `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_SSE_ENDPOINT=/api/document-processing/stream
VITE_RECONNECT_TIMEOUT=30000
VITE_EVENT_DEBOUNCE_MS=500
```

## Usage

### Basic Setup

```svelte
<script>
  import { onMount } from 'svelte';
  import ProgressCard from '$lib/components/dashboard/ProgressCard.svelte';
  import DocumentThumbnailTray from '$lib/components/dashboard/DocumentThumbnailTray.svelte';
  import FallbackAlert from '$lib/components/dashboard/FallbackAlert.svelte';
  import { sseStatusStore } from '$lib/stores/dashboard/SSEStatusStore';
  import { documentProgressStore } from '$lib/stores/dashboard/DocumentProgressStore';

  onMount(async () => {
    // Connect to SSE stream
    await sseStatusStore.connect('/api/document-processing/stream');

    // Listen for events
    sseStatusStore.onMessage((event) => {
      documentProgressStore.updateFromEvent(event);
    });
  });
</script>

<div class="courthouse-dashboard">
  <ProgressCard />
  <DocumentThumbnailTray />
  <FallbackAlert />
</div>
```

### Initialize Document Processing

```typescript
import { documentProgressStore } from '$lib/stores/dashboard/DocumentProgressStore';

// Initialize with document info
documentProgressStore.initializeDocument(
  'doc-123',           // documentId
  'Evidence Document', // documentTitle
  12                   // totalPages
);
```

### Handle Events

```typescript
import { GrpcStatusAdapter } from '$lib/stores/dashboard/GrpcStatusAdapter';

sseStatusStore.onMessage((event) => {
  const normalized = GrpcStatusAdapter.processEvent(event);

  if (normalized) {
    documentProgressStore.updateFromEvent(normalized);

    // Check for fallback
    if (GrpcStatusAdapter.isFallbackEvent(normalized)) {
      documentProgressStore.setFallbackActive(true, normalized.confidence);
    }

    // Check for completion
    if (GrpcStatusAdapter.isCompletionEvent(normalized)) {
      documentProgressStore.complete();
    }
  }
});
```

### Send Commands

```typescript
import { documentProcessingAPI } from '$lib/services/dashboard/DocumentProcessingAPI';

// Pause processing
await documentProcessingAPI.pauseProcessing('doc-123');

// Resume processing
await documentProcessingAPI.resumeProcessing('doc-123');

// Retry with GPU after fallback
await documentProcessingAPI.retryWithGPU('doc-123');

// Retry specific page
await documentProcessingAPI.retryPage('doc-123', 5);
```

## Event Format

Events from the Go gRPC Gateway should follow this format:

```json
{
  "stage": "granite_docling",
  "status": "Parsing document layout",
  "page": 4,
  "pages_total": 12,
  "percent": 62,
  "eta": 31,
  "details": "1 stamp, 3 tables, 42 text blocks",
  "timestamp": "2025-11-23T10:30:45Z",
  "confidence": 0.95
}
```

### Valid Stages
- `imagemagick` - ImageMagick preprocessing
- `esrgan` - Real-ESRGAN enhancement
- `sam` - SAM segmentation
- `granite_docling` - Granite-Docling parsing (primary)
- `tesseract_fallback` - Tesseract OCR fallback

## Styling

### Color Palette

```css
:root {
  --noir: #1a1a1a;           /* Primary text */
  --beige: #f5f1e8;          /* Background */
  --bronze: #b8860b;         /* Progress fill */
  --navy: #1a3a52;           /* Progress background */
  --court-red: #8b3a3a;      /* Alert background */
  --burgundy: #6b2c2c;       /* Accent */
  --gold-accent: #d4af37;    /* Highlights */
}
```

### Typography

```css
--font-serif-heading: 'Merriweather', 'Spectral', 'Playfair Display', serif;
--font-sans-body: 'Inter', 'Source Sans Pro', 'Roboto', sans-serif;
--font-mono-code: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
```

### Responsive Breakpoints

- **Desktop (lg)**: Progress left, tray top-right
- **Tablet (md)**: Stacked vertically
- **Mobile (sm)**: Full-width stacked

## Accessibility

### ARIA Labels

All interactive elements include proper ARIA labels:

```svelte
<div
  role="progressbar"
  aria-valuenow={percentage}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="Document processing progress: {percentage}% complete"
>
```

### Keyboard Navigation

- Tab: Navigate between elements
- Enter/Space: Activate buttons
- Escape: Close modals

### Color Contrast

All text meets WCAG AA standards (4.5:1 minimum contrast ratio).

### Screen Reader Support

- Status announcements for progress updates
- Alert announcements for errors and warnings
- Semantic HTML structure

## Error Handling

### Connection Errors

Automatic reconnection with exponential backoff:
- 1s, 2s, 4s, 8s, 16s delays
- Maximum 5 reconnection attempts

### Event Parsing Errors

- Validation of all incoming events
- Graceful error handling with logging
- Continues processing on parse errors

### Timeout Handling

- 5-minute timeout detection
- User notification and retry options
- Automatic recovery attempts

## Performance

### Optimization Strategies

1. **Debounced Updates**: Batch SSE events to prevent excessive re-renders
2. **Lazy Loading**: Page thumbnails load on demand
3. **Memory Management**: Clean up event listeners on component unmount
4. **CSS Optimization**: Use CSS variables for theme switching

### Update Frequency

- Progress updates: Every 500ms-1s
- Smooth animations: 300ms transitions
- No excessive re-renders

## Browser Support

### Required Features

- Server-Sent Events (SSE)
- CSS Variables
- Fetch API
- localStorage
- ES2020+ JavaScript

### Tested Browsers

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## API Endpoints

### SSE Stream

```
GET /api/document-processing/stream
Authorization: Bearer {token}
```

### Commands

```
POST /api/document-processing/command
Content-Type: application/json
Authorization: Bearer {token}

{
  "action": "pause|resume|cancel|retry",
  "documentId": "doc-123",
  "pageNumber": 5
}
```

### Status

```
GET /api/document-processing/status/{documentId}
Authorization: Bearer {token}
```

### Results

```
GET /api/document-processing/results/{documentId}
Authorization: Bearer {token}
```

## Troubleshooting

### Connection Issues

1. Check API base URL in environment variables
2. Verify authentication token is valid
3. Check browser console for error messages
4. Ensure SSE endpoint is accessible

### Progress Not Updating

1. Verify events are being sent from backend
2. Check event format matches specification
3. Review browser console for parsing errors
4. Check network tab for SSE stream

### Styling Issues

1. Ensure courthouse-theme.css is imported
2. Check CSS variable values
3. Verify font files are loaded
4. Clear browser cache

## Development

### Running Locally

```bash
npm run dev
```

Navigate to `http://localhost:5173/dashboard/legal-progress`

### Building for Production

```bash
npm run build
npm run preview
```

### Type Checking

```bash
npm run check
```

## Contributing

When adding new features:

1. Follow the existing component structure
2. Use TypeScript for type safety
3. Add ARIA labels for accessibility
4. Test with keyboard navigation
5. Verify color contrast ratios
6. Update this README

## License

Part of the Legal AI Evidence Processing System.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Check network tab for API issues
4. Contact the development team
