# Phase 74: SvelteKit Frontend - Implementation Tasks

## Overview

Enhancement tasks for existing SvelteKit 2 + Svelte 5 frontend (`sveltekit-frontend/`) with AST analysis, agentic suggestions, web search, and RAG integration. Building on existing infrastructure.

---

## Core Implementation Tasks

- [x] 1. Project Setup (EXISTING)
  - SvelteKit 2 + Svelte 5 project already exists at `sveltekit-frontend/`
  - ts-morph, uno.css, drizzle-orm already configured
  - Existing AST processor at `src/lib/ast/ast-processor.ts`
  - _Requirements: 8.1, 8.2_

- [x] 2. Drizzle ORM Schema (EXISTING)
  - Schema exists at `sveltekit-frontend/drizzle/schema.ts`
  - Migrations configured
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 3. Implement AST Analysis Engine
  - [x] 3.1 Create ASTAnalyzer class with tsmorph
    - Created `src/lib/ast/svelte-check-analyzer.ts`
    - Initialize Project with in-memory file system
    - Implement analyze() method
    - Extract errors, functions, variables, types
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 3.2 Create error extraction and mapping
    - Map diagnostic categories to severity levels
    - Extract line/column positions
    - Format error messages with auto-suggestions
    - _Requirements: 1.3, 5.2, 5.3_

- [ ] 4. Implement Monaco Code Editor Component
  - [ ] 4.1 Create CodeEditor.svelte with Monaco
    - Set up Monaco editor instance
    - Configure TypeScript/JavaScript language support
    - Implement two-way binding with $bindable
    - _Requirements: 5.1, 5.4_
  - [ ] 4.2 Add real-time error highlighting
    - Integrate with AST analyzer
    - Add Monaco markers for errors
    - Implement debounced analysis
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 5. Implement Error Panel Component
  - Created `src/lib/components/ast/ErrorPanel.svelte`
  - Display errors with severity icons
  - Add click-to-navigate to error location
  - Show error count badge
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 6. Implement Suggestion Engine
  - [x] 6.1 Create SuggestionEngine class
    - Created `src/lib/ast/suggestion-engine.ts`
    - Implement getSuggestions() method with RAG, web search, AI
    - Add RAG context retrieval
    - Implement suggestion ranking
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 6.2 Create SuggestionList.svelte component
    - Created `src/lib/components/ast/SuggestionList.svelte`
    - Display suggestions with confidence scores
    - Show reasoning explanations
    - Add apply/dismiss actions
    - _Requirements: 2.4, 2.5_

- [x] 7. Implement Cluster Badge Component
  - Created `src/lib/components/ast/ClusterBadge.svelte`
  - Map cluster types to colors/icons
  - Add hover tooltip with cluster info
  - Implement cluster filtering
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Implement Web Search Integration
  - [ ] 8.1 Create WebSearchService class
    - Implement search() method with caching
    - Add 24-hour TTL cache
    - Handle rate limiting
    - _Requirements: 3.1, 3.2, 3.5_
  - [ ] 8.2 Create SearchResults.svelte component
    - Display search results with source attribution
    - Add loading indicator
    - Show external links
    - _Requirements: 3.3, 3.4_

- [ ] 9. Implement RAG Codebase Context
  - [ ] 9.1 Create codebase indexing service
    - Index code files and extract embeddings
    - Store in codebase_index table
    - Implement incremental updates
    - _Requirements: 4.1, 4.5_
  - [ ] 9.2 Create context retrieval function
    - Implement top-K retrieval
    - Display source files and line numbers
    - Match project conventions
    - _Requirements: 4.2, 4.3, 4.4_

- [ ] 10. Implement Diff Viewer Component
  - Create DiffViewer.svelte
  - Show side-by-side diff
  - Highlight added/removed/modified lines
  - Add apply/undo actions
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 11. Create API Routes
  - [x] 11.1 Create /api/analyze endpoint
    - Created `src/routes/api/ast/analyze/+server.ts`
    - Accept code and language
    - Return AST analysis results
    - _Requirements: 1.1, 7.1_
  - [x] 11.2 Create /api/suggest endpoint
    - Created `src/routes/api/ast/suggest/+server.ts`
    - Accept error and context
    - Return ranked suggestions
    - _Requirements: 2.1, 2.3_
  - [ ] 11.3 Create /api/search/unified endpoint
    - Proxy to Phase 73 backend
    - Handle errors gracefully
    - _Requirements: 9.1, 9.4, 9.5_

- [ ] 12. Implement Phase 73 Backend Client
  - Create phase73-client.ts
  - Implement unified search call
  - Handle cluster data and re-ranking scores
  - Add retry logic and error handling
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 13. Implement Theme and Preferences
  - [ ] 13.1 Create theme toggle component
    - Support light/dark themes
    - Persist preference to database
    - _Requirements: 8.5_
  - [ ] 13.2 Create preferences page
    - Auto-suggest toggle
    - Web search enable/disable
    - Export analysis results
    - _Requirements: 7.4, 7.5_

- [ ] 14. Create Main Page Layout
  - Create +page.svelte with editor layout
  - Integrate all components
  - Add responsive layout with uno.css
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

---

## Optional Enhancement Tasks

- [ ]* 15. Write Unit Tests for AST Analyzer
  - Test parsing accuracy
  - Test error extraction
  - Test function/variable extraction
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 16. Write Integration Tests for API Routes
  - Test /api/analyze endpoint
  - Test /api/suggest endpoint
  - Test Phase 73 integration
  - _Requirements: 9.1, 11.1, 11.2_

- [ ]* 17. Add Accessibility Features
  - Keyboard navigation
  - Screen reader support
  - ARIA labels
  - _Requirements: 8.1_

---

## Task Dependencies

```
1. Project Setup
├─ 2. Drizzle Schema
│  └─ 11. API Routes
│     └─ 12. Phase 73 Client
├─ 3. AST Analyzer
│  └─ 4. Monaco Editor
│     └─ 5. Error Panel
│        └─ 6. Suggestion Engine
│           └─ 7. Cluster Badge
│              └─ 10. Diff Viewer
├─ 8. Web Search
│  └─ 9. RAG Context
└─ 13. Theme/Preferences
   └─ 14. Main Layout
```

---

## Execution Notes

### Phase 1: Foundation (Tasks 1-2)
- Set up project structure
- Configure all dependencies
- Estimated: 1 day

### Phase 2: Core Analysis (Tasks 3-5)
- AST engine and editor
- Error detection and display
- Estimated: 2-3 days

### Phase 3: Suggestions (Tasks 6-7)
- Suggestion engine and UI
- Cluster badges
- Estimated: 2 days

### Phase 4: Search & RAG (Tasks 8-9)
- Web search integration
- Codebase indexing
- Estimated: 2 days

### Phase 5: Integration (Tasks 10-14)
- Diff viewer
- API routes
- Main layout
- Estimated: 2-3 days

---

## Success Criteria

- [ ] SvelteKit 2 + Svelte 5 project builds
- [ ] Monaco editor renders and accepts input
- [ ] AST analysis detects errors correctly
- [ ] Suggestions display with confidence scores
- [ ] Cluster badges show semantic grouping
- [ ] Web search returns cached results
- [ ] RAG retrieves relevant codebase context
- [ ] Diff viewer shows changes correctly
- [ ] Phase 73 backend integration works
- [ ] Theme toggle persists preference
- [ ] Responsive layout works on all viewports
