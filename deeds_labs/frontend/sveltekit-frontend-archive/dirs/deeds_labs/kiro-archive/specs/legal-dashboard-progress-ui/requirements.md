# Requirements Document: Legal Dashboard with Real-Time Document Processing Progress UI

## Introduction

This specification defines the requirements for a professional courthouse-themed dashboard that displays real-time document processing progress during evidence ingestion. The system integrates with the existing YoRHa noir-beige theme while adopting formal judicial aesthetics (burgundy, navy, bronze). It provides streaming status updates for multi-stage document parsing (ImageMagick preprocessing, Real-ESRGAN enhancement, SAM segmentation, Granite-Docling parsing, Tesseract fallback) with visual progress indicators, per-page thumbnails, and fallback alerts.

## Glossary

- **Legal Dashboard**: The main UI component displaying document processing progress with professional courthouse styling
- **Progress Card**: A visual component showing current parsing stage, percentage complete, ETA, and document metadata
- **Document Thumbnail Tray**: A horizontal strip showing per-page processing status (✓ complete, pending, error)
- **Streaming Status Events**: Real-time updates from Go gRPC Gateway about document processing stages
- **Fallback Alert**: Warning notification when GPU processing fails and CPU fallback (Tesseract) is activated
- **Granite-Docling**: Primary GPU-accelerated document parser (258M VLM) for OCR, layout, tables, math
- **Tesseract Fallback**: CPU-based OCR fallback when GPU is unavailable
- **Courthouse Color Scheme**: Professional judicial palette (burgundy, navy, bronze) extending YoRHa noir-beige theme
- **YoRHa Theme Tokens**: Existing CSS variables (--noir, --beige, --bronze) from theme.css
- **SSE/WebSocket**: Server-Sent Events or WebSocket for real-time status streaming
- **Document Processing Pipeline**: Multi-stage workflow: ImageMagick → Real-ESRGAN → SAM → Granite-Docling → Tesseract (fallback)

## Requirements

### Requirement 1: Professional Courthouse-Themed Dashboard

**User Story:** As a legal investigator, I want a professional, formal dashboard with courthouse aesthetics so that the interface reflects the serious nature of legal evidence processing.

#### Acceptance Criteria

1. WHEN the dashboard loads, THE system SHALL apply professional judicial styling with serif headings (Merriweather, Spectral, or Playfair Display) and sans-serif body text (Inter, Source Sans, or Roboto)
   - _References: Courthouse color scheme with burgundy, navy, bronze_
   - _Tech: Use Svelte 5 components with Uno.css utilities_
   - _Styling: Extend theme.css with --navy, --court-red, --bronze tokens_

2. WHILE the dashboard is displayed, THE system SHALL maintain YoRHa noir-beige palette as base with courtroom metallics as accents
   - _References: var(--noir) for text, var(--beige) for backgrounds, var(--bronze) for progress bars_
   - _Tech: CSS custom properties in theme.css_
   - _Consistency: No "gamer UI / HUD glitch" aesthetic_

3. WHEN rendering progress indicators, THE system SHALL use var(--bronze) for filled progress and var(--navy) at 20% opacity for background
   - _References: Design shows professional progress bars_
   - _Tech: Use CSS gradients and transitions_
   - _Visual: Smooth animations without jarring effects_

4. WHERE alert warnings are needed, THE system SHALL display with var(--court-red) background and clear warning icon
   - _References: Design shows ⚠ OCR fallback alerts_
   - _Tech: Use semantic alert component_
   - _Accessibility: Include ARIA labels for screen readers_

5. IF system uses monospace font for metadata, THEN THE system SHALL use JetBrains Mono for code snippets and technical details
   - _References: Design shows metadata in monospace_
   - _Tech: Apply font-family: 'JetBrains Mono' to code elements_
   - _Readability: Ensure 12-14px font size for metadata_

### Requirement 2: Real-Time Progress Card Component

**User Story:** As a user, I want a clear, real-time progress card showing document parsing status so that I can monitor processing without confusion.

#### Acceptance Criteria

1. WHEN document processing begins, THE system SHALL display a progress card with document title, current stage, percentage complete, and ETA
   - _References: Design shows "📄 Parsing Evidence Document" with 62% progress_
   - _Tech: Create ProgressCard.svelte component_
   - _Data: Receive from SSE/WebSocket events_

2. WHILE processing is active, THE system SHALL update progress bar, percentage, and ETA every 500ms without flickering
   - _References: Design shows smooth progress animation_
   - _Tech: Use Svelte 5 $state runes for reactive updates_
   - _Performance: Debounce updates to prevent excessive re-renders_

3. WHEN processing stage changes, THE system SHALL display stage name and page number (e.g., "Granite-Docling (Page 4/12)")
   - _References: Design shows stage and page info_
   - _Tech: Parse stage from event payload_
   - _Clarity: Show human-readable stage names_

4. WHERE processing includes multiple pages, THE system SHALL display current page and total page count
   - _References: Design shows "Page 4/12"_
   - _Tech: Extract from event data_
   - _Accuracy: Update as pages complete_

5. IF ETA is available, THEN THE system SHALL display in MM:SS format (e.g., "00:31s")
   - _References: Design shows ETA display_
   - _Tech: Calculate from event data_
   - _Realism: Update ETA based on actual processing speed_

### Requirement 3: Document Thumbnail Tray

**User Story:** As a user, I want to see per-page processing status at a glance so that I can identify which pages are complete, pending, or have errors.

#### Acceptance Criteria

1. WHEN document processing starts, THE system SHALL display a horizontal tray of page thumbnails in top-right corner
   - _References: Design shows "[1 ✓] [2 ✓] [3 ...] [4 pending] [5 pending]"_
   - _Tech: Create DocumentThumbnailTray.svelte component_
   - _Layout: Use horizontal flex layout with fixed width_

2. WHILE pages are processing, THE system SHALL show status indicators: ✓ (complete), ... (processing), pending (queued), ✗ (error)
   - _References: Design shows visual status indicators_
   - _Tech: Use Unicode symbols or SVG icons_
   - _Clarity: Color-code by status (green, yellow, gray, red)_

3. WHEN user hovers over a page thumbnail, THE system SHALL display page number and processing stage
   - _References: Design shows tooltip on hover_
   - _Tech: Use Bits UI v2 tooltip component_
   - _UX: Show stage name and timestamp_

4. WHERE page has error, THE system SHALL display error icon and allow user to click for details
   - _References: Design shows error handling_
   - _Tech: Show error modal on click_
   - _Debugging: Display error message and retry option_

5. IF all pages complete, THEN THE system SHALL display completion indicator with timestamp
   - _References: Design shows completion status_
   - _Tech: Update tray with final status_
   - _Feedback: Show success message_

### Requirement 4: Real-Time Status Events from Go gRPC Gateway

**User Story:** As a developer, I want real-time status events from the Go backend so that the frontend can display accurate, up-to-date processing information.

#### Acceptance Criteria

1. WHEN document processing starts, THE system SHALL establish SSE or WebSocket connection to Go gRPC Gateway
   - _References: Design shows streaming architecture_
   - _Tech: Use fetch with EventSource or WebSocket API_
   - _Connection: Establish at `/api/document-processing/stream`_

2. WHILE processing is active, THE system SHALL receive events with stage, status, page, pages_total, percent, eta, details
   - _References: Event format shows all required fields_
   - _Tech: Parse JSON events_
   - _Frequency: Receive updates every 500ms-1s_

3. WHEN event is received, THE system SHALL update frontend state and trigger UI re-render
   - _References: Design shows real-time updates_
   - _Tech: Use Svelte 5 $state runes_
   - _Performance: Batch updates to prevent excessive renders_

4. WHERE event includes legal-specific details, THE system SHALL display in status text (e.g., "1 stamp, 3 tables, 42 text blocks")
   - _References: Design shows detailed status_
   - _Tech: Parse details field from event_
   - _Clarity: Show human-readable details_

5. IF connection drops, THEN THE system SHALL attempt reconnection with exponential backoff
   - _References: Design shows resilience_
   - _Tech: Implement retry logic_
   - _UX: Show connection status indicator_

### Requirement 5: Fallback Alert for CPU OCR

**User Story:** As a user, I want clear alerts when GPU processing fails and CPU fallback is activated so that I understand why processing may be slower.

#### Acceptance Criteria

1. WHEN Granite-Docling GPU processing fails, THE system SHALL display fallback alert with warning icon and explanation
   - _References: Design shows "⚠ OCR fallback (Tesseract)"_
   - _Tech: Create FallbackAlert.svelte component_
   - _Styling: Use var(--court-red) background_

2. WHILE CPU fallback is active, THE system SHALL display message "Evidence preserved, structure pending GPU retry"
   - _References: Design shows fallback message_
   - _Tech: Show in alert component_
   - _Clarity: Explain what data is preserved_

3. WHEN fallback event is received, THE system SHALL update progress card with fallback stage
   - _References: Event shows stage: "tesseract_fallback"_
   - _Tech: Parse event and update UI_
   - _Transparency: Show confidence level (e.g., 0.41)_

4. WHERE GPU becomes available again, THE system SHALL offer option to retry with GPU
   - _References: Design shows retry capability_
   - _Tech: Add "Retry with GPU" button_
   - _UX: Allow user to trigger re-processing_

5. IF fallback completes successfully, THEN THE system SHALL display completion status with note about structure restoration
   - _References: Design shows completion handling_
   - _Tech: Update alert to show success_
   - _Feedback: Confirm data integrity_

### Requirement 6: Legal-Specific Status Messages

**User Story:** As a legal professional, I want status messages that reflect document analysis activities so that I understand what the system is doing.

#### Acceptance Criteria

1. WHEN ImageMagick preprocessing runs, THE system SHALL display "Extracting layout & structure…"
   - _References: Design shows preprocessing status_
   - _Tech: Map stage to human-readable message_
   - _Clarity: Use legal terminology_

2. WHILE Real-ESRGAN enhancement is active, THE system SHALL display "Enhancing low-confidence regions…"
   - _References: Design shows enhancement status_
   - _Tech: Show stage-specific message_
   - _Accuracy: Reflect actual processing_

3. WHEN SAM segmentation runs, THE system SHALL display "Detecting agency seals…", "Analyzing signature strokes…", "Extracting table cells & column headers…"
   - _References: Design shows legal-specific statuses_
   - _Tech: Show detailed segmentation activities_
   - _Relevance: Focus on legal document elements_

4. WHERE Granite-Docling parsing is active, THE system SHALL display "Parsing document layout", "Extracting text content", "Analyzing tables and structures"
   - _References: Design shows parsing stages_
   - _Tech: Show parsing progress_
   - _Detail: Break down parsing into sub-stages_

5. IF Tesseract fallback is active, THEN THE system SHALL display "CPU fallback OCR" with confidence level
   - _References: Design shows fallback status_
   - _Tech: Show confidence metric_
   - _Transparency: Indicate quality level_

### Requirement 7: Streaming Architecture Integration

**User Story:** As a developer, I want the frontend to integrate seamlessly with the Go gRPC Gateway streaming architecture so that status updates flow reliably.

#### Acceptance Criteria

1. WHEN frontend initializes, THE system SHALL create SSEStatusStore.ts for managing streaming state
   - _References: Design shows streaming architecture_
   - _Tech: Create Svelte store with SSE logic_
   - _State: Manage connection, events, errors_

2. WHILE events stream, THE system SHALL parse event JSON and update DocumentProgressStore.ts
   - _References: Design shows store-based architecture_
   - _Tech: Create reactive store for progress data_
   - _Reactivity: Use Svelte 5 $state runes_

3. WHEN event contains stage information, THE system SHALL map to GrpcStatusAdapter.ts for normalization
   - _References: Design shows adapter pattern_
   - _Tech: Create adapter for event normalization_
   - _Consistency: Ensure consistent data format_

4. WHERE Python workers emit status, THE system SHALL receive via Go gRPC Gateway and forward to frontend
   - _References: Design shows worker-to-Go callbacks_
   - _Tech: Implement callback mechanism_
   - _Reliability: Ensure no events are lost_

5. IF frontend needs to send commands, THEN THE system SHALL support command channel (e.g., pause, resume, cancel)
   - _References: Design shows bidirectional communication_
   - _Tech: Implement command API_
   - _Control: Allow user to control processing_

### Requirement 8: Courthouse Color Palette Extension

**User Story:** As a designer, I want the theme.css extended with courthouse colors so that the dashboard maintains professional judicial aesthetics.

#### Acceptance Criteria

1. WHEN theme.css is loaded, THE system SHALL define new CSS variables: --navy, --court-red, --bronze
   - _References: Design shows color tokens_
   - _Tech: Add to :root in theme.css_
   - _Values: --navy: #1a3a52, --court-red: #8b3a3a, --bronze: #b8860b_

2. WHILE styling components, THE system SHALL use var(--noir) for primary text and var(--beige) for backgrounds
   - _References: Design shows YoRHa palette as base_
   - _Tech: Reference existing tokens_
   - _Consistency: Maintain noir-beige foundation_

3. WHEN progress bars are rendered, THE system SHALL use var(--bronze) for filled portion and var(--navy) at 20% opacity for background
   - _References: Design shows progress styling_
   - _Tech: Use CSS rgba() for opacity_
   - _Visual: Create professional appearance_

4. WHERE alerts are displayed, THE system SHALL use var(--court-red) for warning background
   - _References: Design shows alert styling_
   - _Tech: Apply to alert components_
   - _Contrast: Ensure WCAG AA compliance_

5. IF component needs accent color, THEN THE system SHALL use var(--bronze) for highlights and borders
   - _References: Design shows bronze accents_
   - _Tech: Apply to interactive elements_
   - _Hierarchy: Use bronze for secondary emphasis_

### Requirement 9: Responsive Layout for Dashboard

**User Story:** As a user, I want the dashboard to work on different screen sizes so that I can monitor processing on desktop, tablet, or mobile.

#### Acceptance Criteria

1. WHEN dashboard renders on desktop (lg breakpoint), THE system SHALL display progress card on left, thumbnail tray on top-right
   - _References: Design shows desktop layout_
   - _Tech: Use Uno.css breakpoints_
   - _Layout: Flex layout with responsive positioning_

2. WHILE on tablet (md breakpoint), THE system SHALL stack components vertically with progress card above thumbnail tray
   - _References: Design shows responsive stacking_
   - _Tech: Use md: breakpoint utilities_
   - _Usability: Maintain readability_

3. WHEN on mobile (sm breakpoint), THE system SHALL display progress card full-width with thumbnail tray below
   - _References: Design shows mobile layout_
   - _Tech: Use sm: breakpoint utilities_
   - _Touch: Ensure touch-friendly sizing_

4. WHERE space is limited, THE system SHALL hide non-essential metadata and show abbreviated status
   - _References: Design shows mobile optimization_
   - _Tech: Use conditional rendering_
   - _Clarity: Keep essential info visible_

5. IF user rotates device, THEN THE system SHALL re-layout components appropriately
   - _References: Design shows orientation handling_
   - _Tech: Use CSS media queries_
   - _UX: Smooth transition between layouts_

### Requirement 10: Error Handling and Resilience

**User Story:** As a system operator, I want robust error handling so that the dashboard gracefully handles failures and provides clear feedback.

#### Acceptance Criteria

1. WHEN SSE connection fails, THE system SHALL display error message and attempt reconnection
   - _References: Design shows error handling_
   - _Tech: Implement error boundary_
   - _UX: Show retry button_

2. WHILE processing encounters errors, THE system SHALL display error alert with details and recovery options
   - _References: Design shows error alerts_
   - _Tech: Create error component_
   - _Debugging: Show error code and message_

3. WHEN event parsing fails, THE system SHALL log error and continue processing
   - _References: Design shows resilience_
   - _Tech: Use try-catch blocks_
   - _Logging: Send to error tracking service_

4. WHERE timeout occurs, THE system SHALL display timeout message and allow user to retry
   - _References: Design shows timeout handling_
   - _Tech: Implement timeout logic_
   - _UX: Show clear retry option_

5. IF critical error occurs, THEN THE system SHALL display error page with troubleshooting steps
   - _References: Design shows error recovery_
   - _Tech: Create error page component_
   - _Support: Provide contact information_

