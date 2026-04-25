# Implementation Plan: Legal Dashboard with Real-Time Document Processing Progress UI

## Overview

This implementation plan breaks down the Legal Dashboard feature into discrete, manageable coding tasks. Each task builds incrementally on previous tasks, starting with core infrastructure (stores and adapters), then UI components, styling, and finally integration with the backend streaming architecture.

---

## Tasks

- [x] 1. Set up project structure and theme extension


  - Create directory structure for dashboard components and stores
  - Extend theme.css with courthouse color tokens (--navy, --court-red, --bronze)
  - Define Uno.css configuration for responsive breakpoints
  - _Requirements: 1.2, 8.1, 8.2_




- [ ] 2. Create Svelte stores for real-time progress management
  - [ ] 2.1 Implement SSEStatusStore.ts for SSE connection management
    - Create store for managing SSE connection state
    - Implement connection establishment and error handling

    - Add reconnection logic with exponential backoff
    - _Requirements: 4.1, 4.2, 10.1_

  - [ ] 2.2 Implement DocumentProgressStore.ts for progress state
    - Create reactive store for document processing state

    - Implement state update methods for events
    - Add page status tracking
    - _Requirements: 4.3, 7.1_




  - [ ] 2.3 Implement GrpcStatusAdapter.ts for event normalization
    - Create adapter to normalize incoming events
    - Map stage names to human-readable labels
    - Validate event data structure
    - _Requirements: 4.4, 6.1_


- [ ] 3. Create ProgressCard component with real-time updates
  - [ ] 3.1 Build ProgressCard.svelte component structure
    - Create component with props for document title, stage, percentage, ETA
    - Implement reactive state binding to DocumentProgressStore

    - Add progress bar, stage indicator, page counter, ETA display
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.2 Implement smooth progress bar animation
    - Create progress bar with CSS transitions

    - Update percentage every 500ms without flickering
    - Use var(--bronze) for fill and var(--navy) for background
    - _Requirements: 2.2, 8.3_




  - [ ] 3.3 Add legal-specific status messages
    - Map processing stages to human-readable messages
    - Display stage name and page number (e.g., "Granite-Docling (Page 4/12)")
    - Show detailed status in smaller text (e.g., "1 stamp, 3 tables, 42 text blocks")
    - _Requirements: 2.3, 2.4, 6.1_


  - [ ] 3.4 Implement ETA display formatting
    - Format ETA as MM:SS (e.g., "00:31s")
    - Update ETA based on actual processing speed
    - Handle edge cases (ETA = 0, ETA > 1 hour)

    - _Requirements: 2.5_

- [ ] 4. Create DocumentThumbnailTray component for page status
  - [ ] 4.1 Build DocumentThumbnailTray.svelte component
    - Create horizontal flex layout for page thumbnails

    - Implement page status indicators (✓, ..., pending, ✗)
    - Color-code by status (green, yellow, gray, red)
    - _Requirements: 3.1, 3.2_




  - [ ] 4.2 Add hover tooltips and page details
    - Implement Bits UI v2 tooltip component
    - Show page number and processing stage on hover
    - Display timestamp when page completes
    - _Requirements: 3.3_


  - [ ] 4.3 Implement error handling and details modal
    - Show error icon for failed pages
    - Create modal to display error details on click
    - Add retry option for failed pages

    - _Requirements: 3.4_

  - [ ] 4.4 Add completion indicator and status tracking
    - Display completion indicator when all pages done
    - Show completion timestamp

    - Update tray as pages complete in real-time
    - _Requirements: 3.5_

- [x] 5. Create FallbackAlert component for GPU failures

  - [x] 5.1 Build FallbackAlert.svelte component

    - Create alert component with warning icon
    - Display fallback message and confidence level
    - Use var(--court-red) background styling
    - _Requirements: 5.1, 5.2_


  - [ ] 5.2 Implement fallback event handling
    - Listen for fallback events from DocumentProgressStore
    - Display alert when fallback activated
    - Show confidence level (e.g., 0.41)
    - _Requirements: 5.3_


  - [ ] 5.3 Add retry functionality
    - Implement "Retry with GPU" button
    - Send retry command to backend
    - Dismiss alert when GPU becomes available

    - _Requirements: 5.4_

  - [ ] 5.4 Handle fallback completion
    - Display completion status with structure restoration note
    - Update alert to show success

    - Confirm data integrity
    - _Requirements: 5.5_

- [x] 6. Create CourthroomProgress.css styling module



  - [ ] 6.1 Define courthouse color palette and typography
    - Add CSS variables for --navy, --court-red, --bronze
    - Define font families (Merriweather, Inter, JetBrains Mono)
    - Set up color scheme extending YoRHa noir-beige
    - _Requirements: 8.1, 8.2, 8.4_


  - [ ] 6.2 Style ProgressCard component
    - Apply professional styling with serif headings
    - Style progress bar with bronze fill and navy background
    - Add subtle borders and spacing

    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 6.3 Style DocumentThumbnailTray component
    - Create horizontal flex layout
    - Style status indicators with color coding

    - Add hover effects and transitions
    - _Requirements: 3.1, 3.2_

  - [x] 6.4 Style FallbackAlert component



    - Apply court-red background with proper contrast
    - Style warning icon and text
    - Add button styling with bronze accents
    - _Requirements: 1.4, 5.1_


  - [ ] 6.5 Implement responsive layout with Uno.css
    - Create desktop layout (lg breakpoint): progress left, tray top-right
    - Create tablet layout (md breakpoint): stacked vertically
    - Create mobile layout (sm breakpoint): full-width stacked
    - _Requirements: 9.1, 9.2, 9.3_


- [ ] 7. Create main dashboard page component
  - [ ] 7.1 Build +page.svelte for dashboard
    - Create page component that combines all sub-components
    - Initialize SSEStatusStore on mount

    - Set up reactive bindings to stores
    - _Requirements: 1.1, 4.1_

  - [x] 7.2 Implement SSE connection initialization



    - Establish SSE connection to /api/document-processing/stream
    - Handle connection events (open, message, error)
    - Implement error handling and reconnection
    - _Requirements: 4.1, 4.2_


  - [ ] 7.3 Add event parsing and state updates
    - Parse incoming SSE events
    - Update DocumentProgressStore with event data
    - Handle different event types (progress, fallback, error)
    - _Requirements: 4.3, 4.4_


  - [ ] 7.4 Implement page layout and component composition
    - Arrange ProgressCard, DocumentThumbnailTray, FallbackAlert
    - Apply responsive layout with Uno.css



    - Add loading and error states
    - _Requirements: 1.1, 9.1_

- [ ] 8. Implement error handling and resilience
  - [x] 8.1 Add connection error handling

    - Implement exponential backoff reconnection
    - Display connection status indicator
    - Show error messages to user
    - _Requirements: 10.1, 10.2_


  - [ ] 8.2 Add event parsing error handling
    - Implement try-catch for event parsing
    - Log errors to console and error tracking
    - Continue processing on parse errors
    - _Requirements: 10.3_


  - [ ] 8.3 Add timeout handling
    - Implement timeout detection (5 minutes)
    - Display timeout message

    - Allow user to retry or cancel
    - _Requirements: 10.4_

  - [ ] 8.4 Add critical error handling
    - Create error boundary component
    - Display error page with troubleshooting steps
    - Provide contact information for support
    - _Requirements: 10.5_

- [ ] 9. Integrate with Go gRPC Gateway backend
  - [ ] 9.1 Create API client for SSE streaming
    - Implement SSE client in SSEStatusStore
    - Handle authentication with Bearer token
    - Implement event parsing and validation
    - _Requirements: 4.1, 4.2, 7.1_

  - [ ] 9.2 Implement command channel for user actions
    - Create API for sending commands (pause, resume, cancel)
    - Implement retry command for fallback
    - Handle command responses
    - _Requirements: 7.5_

  - [ ] 9.3 Add backend integration tests
    - Test SSE connection establishment
    - Test event parsing and state updates
    - Test error handling and reconnection
    - _Requirements: 4.1, 4.2, 4.3_


- [ ] 10. Add accessibility and browser compatibility
  - [ ] 10.1 Implement ARIA labels and semantic HTML
    - Add aria-label to progress bar
    - Add aria-label to status indicators
    - Use semantic HTML elements
    - _Requirements: 1.4_

  - [ ] 10.2 Ensure WCAG AA color contrast
    - Verify text contrast ratios
    - Test with color blindness simulator
    - Adjust colors if needed
    - _Requirements: 1.4, 8.4_

  - [ ] 10.3 Add keyboard navigation support
    - Support Tab navigation
    - Support Enter for buttons
    - Support Escape to close modals
    - _Requirements: 1.4_

  - [ ] 10.4 Test browser compatibility
    - Test in Chrome, Firefox, Safari, Edge


    - Test SSE support
    - Test CSS variables support
    - _Requirements: 1.1, 1.2_

- [ ]* 11. Create unit tests for components and stores
  - [ ]* 11.1 Write tests for ProgressCard component
    - Test percentage calculation
    - Test ETA formatting
    - Test stage label mapping
    - Test responsive layout
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 11.2 Write tests for DocumentThumbnailTray component
    - Test page status rendering
    - Test status icon display
    - Test tooltip content
    - Test error handling
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 11.3 Write tests for FallbackAlert component
    - Test alert visibility
    - Test confidence display
    - Test retry callback
    - Test dismissal
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 11.4 Write tests for stores
    - Test SSE connection establishment
    - Test event parsing
    - Test state updates
    - Test error handling
    - _Requirements: 4.1, 4.2, 4.3_

- [ ]* 12. Create integration tests for end-to-end scenarios
  - [ ]* 12.1 Test end-to-end document processing
    - Start document processing
    - Verify progress updates
    - Verify page thumbnails update
    - Verify completion
    - _Requirements: 2.1, 3.1, 4.1_

  - [ ]* 12.2 Test fallback scenario
    - Trigger GPU failure
    - Verify fallback alert appears
    - Verify Tesseract processing continues
    - Verify retry option works
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 12.3 Test error recovery
    - Simulate connection drop
    - Verify reconnection
    - Verify state recovery
    - Verify UI updates
    - _Requirements: 10.1, 10.2, 10.3_

- [ ]* 13. Create performance tests
  - [ ]* 13.1 Test update frequency and rendering
    - Verify updates every 500ms-1s
    - Verify no excessive re-renders
    - Verify smooth animations
    - _Requirements: 2.2_

  - [ ]* 13.2 Test memory usage and cleanup
    - Verify no memory leaks
    - Verify store cleanup on unmount
    - Verify event listener cleanup
    - _Requirements: 4.1, 4.2_

---

## Task Execution Notes

### Prerequisites
- SvelteKit 5 project set up with Uno.css
- YoRHa theme.css with existing --noir, --beige, --bronze tokens
- Go gRPC Gateway backend with /api/document-processing/stream endpoint
- Bits UI v2 installed and configured

### Dependencies Between Tasks
1. Tasks 2.1-2.3 (stores) must complete before tasks 3-5 (components)
2. Task 6 (styling) can run in parallel with tasks 3-5
3. Task 7 (main page) depends on tasks 2-6
4. Task 8 (error handling) should be integrated throughout tasks 3-7
5. Task 9 (backend integration) depends on tasks 2 and 7
6. Tasks 11-13 (tests) can run after tasks 3-9

### Implementation Order
1. Start with stores (task 2) - foundation for all components
2. Build components (tasks 3-5) - core UI
3. Create styling (task 6) - visual polish
4. Assemble page (task 7) - integration
5. Add error handling (task 8) - robustness
6. Integrate backend (task 9) - functionality
7. Add accessibility (task 10) - compliance
8. Write tests (tasks 11-13) - quality assurance

