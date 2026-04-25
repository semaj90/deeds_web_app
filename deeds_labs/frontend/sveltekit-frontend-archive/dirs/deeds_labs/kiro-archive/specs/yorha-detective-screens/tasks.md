# Implementation Plan: YoRHa Detective Screens

## Overview

This implementation plan converts the YoRHa Detective Screens design into actionable coding tasks. Each task builds incrementally on previous work, integrating with the existing PDF ingestion pipeline, chain-of-custody logging, and Gemma-powered analysis.

---

## Phase 1: Command Center Dashboard

- [x] 1. Set up Command Center route and layout structure




  - Create `/routes/dashboard/+page.svelte` with header, statistics panel, and active cases section
  - Implement responsive grid layout using UnoCSS


  - Add persistent navigation bar with links to Dashboard, Cases, Evidence Board, Terminal
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Implement statistics panel with real-time data


  - Create `/lib/components/dashboard/StatisticsPanel.svelte` with cards for: active cases, pending evidence, approved evidence, persons of interest
  - Fetch initial stats from `GET /api/dashboard/stats`
  - Display counts with bone-white cards and crimson accents
  - _Requirements: 1.1, 1.2_



- [ ] 3. Create active cases list with case cards
  - Build `/lib/components/dashboard/CaseCardGrid.svelte` with repeating case cards
  - Each card displays: case title, status badge, evidence count, last updated, quick action buttons


  - Implement click handler to navigate to case detail page
  - _Requirements: 1.3, 1.4_




- [ ] 4. Implement system status panel
  - Create `/lib/components/dashboard/SystemStatusPanel.svelte` showing: database connection, Elasticsearch status, Gemma service availability, storage capacity
  - Fetch status from `GET /api/dashboard/stats`
  - Display status indicators with color coding (green/amber/red)
  - _Requirements: 1.7_

- [ ] 5. Add quick actions panel
  - Build `/lib/components/dashboard/QuickActionsPanel.svelte` with buttons: Timeline Analysis, Evidence Summary, Suspect Connections, Generate Report
  - Implement click handlers to route to appropriate analysis screens
  - _Requirements: 1.6_

- [ ] 6. Implement real-time updates via SSE
  - Create SSE connection to `GET /api/dashboard/stream` in `+page.svelte`
  - Update statistics and case cards within 2 seconds of changes
  - Handle connection errors with graceful degradation
  - _Requirements: 1.4_

- [ ]* 7. Write unit tests for dashboard components
  - Test statistics calculation and display
  - Test case card rendering and navigation
  - Test real-time update handling
  - _Requirements: 1.1, 1.2, 1.3_

---

## Phase 2: Backend APIs for Dashboard

- [ ] 8. Create dashboard statistics API endpoint
  - Implement `GET /api/dashboard/stats` in `+server.ts`
  - Query database for: active case count, pending evidence count, approved evidence count, persons of interest count
  - Return JSON with statistics and system status
  - _Requirements: 1.1, 1.2, 1.7_

- [ ] 9. Create dashboard SSE stream endpoint
  - Implement `GET /api/dashboard/stream` in `+server.ts`
  - Set up Server-Sent Events connection
  - Broadcast updates when: evidence is approved, cases are created/updated, system status changes
  - _Requirements: 1.4_

- [x] 10. Create cases list API endpoint


  - Implement `GET /api/cases` in `+server.ts`
  - Support pagination with cursor-based approach
  - Return case list with: ID, title, status, evidence count, last updated timestamp
  - _Requirements: 1.3_


- [ ] 11. Create case detail API endpoint
  - Implement `GET /api/cases/[id]` in `+server.ts`
  - Return full case details with evidence summary
  - _Requirements: 1.3_

---


## Phase 3: Evidence Board - Canvas & Rendering

- [ ] 12. Set up Evidence Board route and HTML5 canvas
  - Create `/routes/cases/[id]/board/+page.svelte`

  - Initialize HTML5 canvas element with blueprint grid background
  - Implement canvas resize handler for responsive layout
  - _Requirements: 2.1, 5.2_

- [ ] 13. Implement evidence node rendering on canvas
  - Create `/lib/components/board/CanvasBoard.svelte` component

  - Draw nodes as bone-white rectangles with crimson borders on canvas
  - Display node icon/thumbnail, evidence ID, classification badge, status indicator
  - Position nodes based on stored layout coordinates
  - Implement efficient canvas redraw on state changes
  - _Requirements: 2.1, 2.2, 5.2_

- [ ] 14. Implement relationship line rendering on canvas
  - Draw crimson lines between connected nodes on canvas
  - Display relationship label on hover (using canvas text)
  - Implement efficient line rendering with caching
  - _Requirements: 2.1, 2.4, 5.2_

- [ ] 15. Implement zoom and pan controls
  - Add mouse wheel zoom functionality with canvas transform scaling
  - Implement pan controls for dragging canvas view
  - Maintain readable node labels at all zoom levels
  - Store zoom/pan state in component
  - _Requirements: 2.5_

- [ ] 16. Implement native drag-and-drop for nodes
  - Use HTML5 drag-and-drop API for node movement
  - Detect node hover and update cursor
  - Update node position in memory during drag
  - Persist layout to database on save
  - _Requirements: 2.3, 2.8_

- [ ]* 17. Write canvas rendering tests
  - Test canvas initialization and redraw
  - Test node and line rendering
  - Test zoom/pan functionality
  - _Requirements: 2.1, 2.5_

---

## Phase 4: Evidence Board - Interactions & Relationships

- [ ] 18. Implement context menu for node interactions
  - Create `/lib/components/board/ContextMenu.svelte`
  - Display on right-click: View Details, Add Relationship, Remove Node, Generate Summary
  - Implement click handlers for each action
  - _Requirements: 2.6_

- [ ] 19. Implement relationship creation UI
  - Create `/lib/components/board/RelationshipEditor.svelte`
  - Allow selection of target node and relationship type
  - POST to `/api/evidence/relationships` to create connection
  - Update board immediately with new relationship line
  - _Requirements: 2.7_

- [ ] 20. Implement relationship panel (side panel)
  - Create `/lib/components/board/RelationshipPanel.svelte`
  - Display selected node info and connected nodes tree
  - Show relationship metadata on hover
  - _Requirements: 2.9_

- [ ] 21. Implement board layout save functionality
  - Add "Save Layout" button to toolbar

  - PUT to `/api/cases/[id]/board/layout` with node positions and relationships
  - Display success/error toast
  - _Requirements: 2.8_

- [x] 22. Implement multi-select and filtering

  - Add checkbox selection for multiple nodes
  - Create filter panel for: status, classification, type
  - Update canvas to highlight/hide filtered nodes
  - _Requirements: 2.1_



- [ ]* 23. Write interaction tests for Evidence Board
  - Test node dragging and position updates
  - Test relationship creation and deletion
  - Test layout persistence
  - _Requirements: 2.3, 2.7, 2.8_

---

## Phase 5: Evidence Board - Backend APIs

- [ ] 24. Create evidence nodes API endpoint
  - Implement `GET /api/cases/[id]/evidence` in `+server.ts`
  - Query database for all evidence in case with board positions
  - Return evidence nodes with: ID, title, classification, status, position, relationships


  - _Requirements: 2.1, 2.2_

- [ ] 25. Create relationship CRUD endpoints
  - Implement `POST /api/evidence/relationships` to create relationship

  - Implement `DELETE /api/evidence/relationships/[id]` to remove relationship
  - Implement `GET /api/evidence/[id]/relationships` to fetch all relationships for a node
  - _Requirements: 2.4, 2.7_

- [x] 26. Create board layout persistence endpoint

  - Implement `PUT /api/cases/[id]/board/layout` in `+server.ts`
  - Accept node positions and relationships
  - Update database with new layout
  - _Requirements: 2.8_

- [ ] 27. Implement real-time board updates via SSE
  - Create SSE connection for Evidence Board
  - Broadcast updates when: new evidence added, relationships created, nodes updated
  - Update canvas in real-time
  - _Requirements: 2.1_

---

## Phase 6: AI Legal Terminal - UI & Input

- [ ] 28. Set up AI Legal Terminal route and CRT styling
  - Create `/routes/terminal/+page.svelte`
  - Implement CRT-style interface: black background, neon green text, scanline effects
  - Use monospace font (Courier New)
  - _Requirements: 3.1, 5.3_


- [ ] 29. Create terminal output display component
  - Build `/lib/components/terminal/TerminalOutput.svelte`
  - Display query history with: user query, Gemma response, function call results, timestamps
  - Implement scrollable output with blinking cursor
  - _Requirements: 3.1, 3.5_


- [ ] 30. Create terminal input component
  - Build `/lib/components/terminal/TerminalInput.svelte`
  - Accept natural language queries and system commands
  - Implement command parsing for: /search, /analyze, /extract, /report, /export
  - _Requirements: 3.2, 3.8_


- [ ] 31. Create terminal side panel with command reference
  - Build `/lib/components/terminal/CommandReference.svelte`
  - Display available commands and recent queries
  - Implement click-to-execute for saved queries

  - _Requirements: 3.8_

- [ ] 32. Implement case selector for terminal context
  - Add case dropdown to terminal header
  - Store selected case in session/store

  - Pass case context to all Gemma queries
  - _Requirements: 3.2_

---


## Phase 7: AI Legal Terminal - Gemma Integration

- [ ] 33. Implement Gemma query routing with function-calling
  - Create `/lib/services/gemmaService.ts` with query handler
  - Route queries to Gemma with function-calling prompt
  - Parse Gemma response to detect function calls
  - _Requirements: 3.3, 3.4_

- [ ] 34. Implement search_evidence function
  - Create function handler for `search_evidence(query, case_id)`
  - Execute full-text search via Elasticsearch
  - Execute vector similarity search via pgvector
  - Return top 5 results with snippets and confidence scores
  - _Requirements: 3.4_


- [ ] 35. Implement extract_holdings function
  - Create function handler for `extract_holdings(evidence_id)`
  - Parse legal holdings from evidence text using Gemma
  - Return structured holdings with citations
  - _Requirements: 3.4_




- [ ] 36. Implement find_citations function
  - Create function handler for `find_citations(evidence_id)`
  - Extract case citations, statutes, regulations from evidence
  - Return citations with links to external legal databases


  - _Requirements: 3.4_

- [ ] 37. Implement analyze_relationships function
  - Create function handler for `analyze_relationships(evidence_ids)`
  - Analyze connections between evidence using Gemma
  - Return relationship types and confidence scores
  - _Requirements: 3.4_

- [ ] 38. Implement generate_summary function
  - Create function handler for `generate_summary(case_id)`
  - Compile case overview with key findings
  - Include evidence summary, holdings, citations, investigative status
  - _Requirements: 3.4, 3.6_

---

## Phase 8: AI Legal Terminal - Backend APIs

- [ ] 39. Create terminal query API endpoint
  - Implement `POST /api/terminal/query` in `+server.ts`
  - Accept query string and case ID
  - Route to Gemma with function-calling
  - Return response with function call results
  - _Requirements: 3.3, 3.4_

- [ ] 40. Create terminal query history endpoint
  - Implement `GET /api/terminal/history` in `+server.ts`
  - Return user's query history with pagination
  - _Requirements: 3.5_

- [ ] 41. Create individual function endpoints
  - Implement `POST /api/terminal/functions/search_evidence`
  - Implement `POST /api/terminal/functions/extract_holdings`
  - Implement `POST /api/terminal/functions/find_citations`
  - Implement `POST /api/terminal/functions/analyze_relationships`
  - Implement `POST /api/terminal/functions/generate_summary`
  - _Requirements: 3.4_

- [ ] 42. Implement error handling for terminal queries
  - Handle Gemma connection errors with retry logic
  - Handle function call timeouts with exponential backoff
  - Return helpful error messages to user
  - _Requirements: 3.9_

---

## Phase 9: Cross-Screen Integration

- [ ] 43. Implement persistent navigation bar
  - Create `/lib/components/layout/PersistentNav.svelte`
  - Display on all screens: Dashboard, Cases, Evidence Board, Terminal
  - Maintain case context across navigation
  - _Requirements: 4.2_

- [ ] 44. Implement case context store
  - Create `/lib/stores/caseStore.ts` with SvelteKit store
  - Store selected case ID, zoom level, terminal history
  - Persist to session storage
  - _Requirements: 4.1_

- [ ] 45. Implement Evidence Board highlighting from terminal
  - When prosecutor queries terminal for evidence, store matching node IDs
  - On navigation to Evidence Board, highlight matching nodes
  - _Requirements: 4.4_

- [ ] 46. Implement real-time sync across screens
  - When evidence is approved on Evidence Board, update Command Center counts
  - When relationship is added on Evidence Board, make available to terminal queries
  - Use shared SSE stream or WebSocket for updates
  - _Requirements: 4.3, 4.6_

- [ ] 47. Implement report export with full context
  - Create `/lib/services/reportService.ts`
  - Compile evidence summaries, holdings, citations, board layout, chain-of-custody logs
  - Generate formatted legal document (PDF or DOCX)
  - _Requirements: 4.7_

---

## Phase 10: Audit Mode & Digital Signatures (L3 Forensic Compliance)

- [ ] 48. Create audit log database schema
  - Create `warden_audit_log` table with: id, user_id, action, payload, signature, hash, timestamp
  - Create `warden_settings` table with: audit_mode (L1/L2/L3)
  - Add indexes for efficient querying
  - _Requirements: 5.1, 5.2_

- [ ] 49. Implement digital signature generation
  - Create `/lib/services/auditService.ts` with signature generation
  - Signature formula: SHA256(user_id + user_email + role + timestamp + action_payload)
  - Store signature with every audit log entry
  - _Requirements: 5.2_

- [ ] 50. Implement L3 enforcement rules
  - Prevent deletion of evidence (must reject instead)
  - Prevent modification of evidence metadata
  - Allow redaction as new version (preserve original)
  - Require confirmation for audit mode changes
  - _Requirements: 5.3_

- [ ] 51. Create audit log UI (CRT terminal style)
  - Build `/lib/components/audit/AuditLogPanel.svelte`
  - Display logs in green neon CRT terminal format
  - Show: timestamp, action, user, signature (truncated)
  - Make logs clickable to reveal full hash + JSON payload
  - _Requirements: 5.4_

- [ ] 52. Implement audit mode downgrade endpoint
  - Create `POST /api/settings/audit-mode` endpoint
  - Require password re-entry and 2FA confirmation
  - Only allow super-admin or lead prosecutor
  - Log downgrade action itself with signature
  - _Requirements: 5.5_

- [ ]* 53. Write audit mode tests
  - Test signature generation and verification
  - Test L3 enforcement rules
  - Test audit log persistence
  - Test audit mode downgrade flow
  - _Requirements: 5.1, 5.2, 5.3_

---

## Phase 11: Integration & Polish

- [ ] 54. Implement error boundaries and fallbacks
  - Add error boundaries to all major components
  - Implement fallback UI for canvas rendering errors
  - Display helpful error messages with troubleshooting
  - _Requirements: 3.9_

- [ ] 55. Optimize performance for large datasets
  - Implement pagination for case lists (cursor-based)
  - Implement LOD (Level of Detail) for Evidence Board nodes
  - Optimize Elasticsearch queries with filters
  - _Requirements: 2.1_

- [ ] 56. Implement accessibility features
  - Add ARIA labels to all interactive elements
  - Ensure keyboard navigation works across all screens
  - Test with screen readers
  - _Requirements: 5.6_

- [ ] 57. Add loading states and skeleton screens
  - Implement skeleton loaders for dashboard statistics
  - Add loading indicators for Evidence Board rendering
  - Show loading state during terminal query processing
  - _Requirements: 1.1, 2.1, 3.3_

- [ ]* 58. Write end-to-end tests for complete workflows
  - Test full investigation workflow: upload → approve → board → terminal → report
  - Test cross-screen navigation and state consistency
  - Test real-time updates across screens
  - _Requirements: 4.1, 4.2, 4.3_

---

## Summary

**Total Tasks**: 58 (47 required, 11 optional)

**Phases**:
1. Command Center Dashboard (7 tasks)
2. Backend APIs for Dashboard (4 tasks)
3. Evidence Board - Canvas & Rendering (6 tasks)
4. Evidence Board - Interactions & Relationships (6 tasks)
5. Evidence Board - Backend APIs (4 tasks)
6. AI Legal Terminal - UI & Input (5 tasks)
7. AI Legal Terminal - Gemma Integration (6 tasks)
8. AI Legal Terminal - Backend APIs (4 tasks)
9. Cross-Screen Integration (5 tasks)
10. Audit Mode & Digital Signatures (6 tasks)
11. Integration & Polish (5 tasks)

**Estimated Timeline**: 2-3 weeks for full implementation with testing

