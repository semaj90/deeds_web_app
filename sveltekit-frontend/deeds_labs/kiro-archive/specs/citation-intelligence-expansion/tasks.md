# Phase 2: Citation Intelligence Expansion - Implementation Plan

## Overview

Expand the Case Reporter Summarizer into a cross-case legal research engine by adding citation management, statute search, and case linking capabilities.

---

## Sprint S-A: Citation Management (Week 1-2)

- [x] 1. Set up citation database schema




  - [x] 1.1 Create `saved_citations` table

    - Fields: id, user_id, case_id, statute_code, statute_title, jurisdiction, severity, year, source_type, highlighted_text, notes, created_at, updated_at
    - Indexes: user_id, case_id, statute_code
    - _Requirements: Citation save & search_


  - [x] 1.2 Create `statute_search_history` table
    - Fields: id, user_id, query, statute_code, results_count, searched_at
    - Indexes: user_id, statute_code
    - _Requirements: Search history tracking_


  - [x] 1.3 Create database migrations
    - Run migrations on PostgreSQL
    - Verify indexes created
    - _Requirements: Database setup_




- [x] 2. Implement citation save API
  - [x] 2.1 Create CitationService

    - Implement `saveCitation()` method
    - Implement `searchCitations()` method
    - Implement `getCitationDetail()` method
    - Implement `deleteCitation()` method
    - Implement `updateCitationNotes()` method
    - _Requirements: Citation CRUD operations_


  - [x] 2.2 Create POST /api/citations/save endpoint
    - Accept statute_code, statute_title, jurisdiction, severity, year, highlighted_text, notes, case_id, source_type
    - Validate input
    - Save to database
    - Log audit event
    - Return saved citation
    - _Requirements: Manual citation save_


  - [x] 2.3 Create GET /api/citations/search endpoint
    - Accept query, jurisdiction, severity filters
    - Implement full-text search
    - Return paginated results
    - Log search history

    - _Requirements: Citation search_

  - [x] 2.4 Create GET /api/citations endpoint
    - Accept case_id, limit, offset parameters
    - Return user's citations

    - Support filtering by case
    - _Requirements: List citations_

  - [x] 2.5 Create GET /api/citations/:id endpoint

    - Return citation detail with metadata
    - Include related cases
    - _Requirements: Citation detail view_

  - [x] 2.6 Create PUT /api/citations/:id endpoint


    - Update citation notes
    - Update tags
    - Log changes
    - _Requirements: Citation update_

  - [x] 2.7 Create DELETE /api/citations/:id endpoint

    - Delete citation
    - Log deletion
    - _Requirements: Citation deletion_



- [x] 3. Integrate citation extraction with auto-save

  - [x] 3.1 Extend CitationExtractionWorker
    - After extracting citations, auto-save to `saved_citations` table
    - Set source_type to 'auto_extracted'
    - Link to case_id
    - _Requirements: Auto-save from summaries_

  - [x] 3.2 Update summary generation flow
    - Trigger citation extraction after summary generation
    - Auto-save extracted citations



    - Log audit events
    - _Requirements: Integration with summarizer_

- [x] 4. Create citation components
  - [x] 4.1 Create CitationHighlighter.svelte



    - Allow highlighting text in summary
    - Show highlighted citations
    - Provide "Save Citation" button
    - _Requirements: Citation highlighting_

  - [x] 4.2 Create CitationSaveModal.svelte
    - Modal for saving citation manually
    - Input fields for metadata
    - Save button
    - _Requirements: Manual citation save UI_

  - [x] 4.3 Create CitationList.svelte


    - Display list of saved citations
    - Show statute code, title, jurisdiction, severity
    - Filter by case
    - _Requirements: Citation list view_


  - [x] 4.4 Create CitationDetail.svelte
    - Display full citation details
    - Show metadata and notes
    - Provide edit/delete buttons

    - _Requirements: Citation detail view_



  - [x] 4.5 Create CitationSearch.svelte
    - Search input with filters
    - Display search results

    - Show search history
    - _Requirements: Citation search UI_


- [x] 5. Integrate citations into SummaryEditor
  - [x] 5.1 Add citation highlighting to SummaryEditor.svelte
    - Allow selecting text to highlight
    - Show highlighted citations



    - Provide "Save Citation" button
    - _Requirements: Citation highlighting in editor_

  - [x] 5.2 Add citation list sidebar to SummaryEditor.svelte
    - Show citations extracted from summary
    - Allow saving individual citations
    - _Requirements: Citation list in editor_


- [x] 6. Write unit tests for citation management

  - [x] 6.1 Test CitationService
    - Test save, search, get, update, delete operations
    - Test validation
    - Test error handling
    - _Requirements: Service testing_


  - [x] 6.2 Test citation API endpoints
    - Test POST /api/citations/save
    - Test GET /api/citations/search
    - Test GET /api/citations
    - Test GET /api/citations/:id
    - Test PUT /api/citations/:id
    - Test DELETE /api/citations/:id

    - _Requirements: API testing_

  - [x] 6.3 Test citation components
    - Test CitationHighlighter
    - Test CitationSaveModal
    - Test CitationList

    - Test CitationDetail
    - Test CitationSearch
    - _Requirements: Component testing_

---


## Sprint S-B: Statute Search (Week 3-4)

- [x] 7. Implement statute search API

  - [x] 7.1 Create StatuteSearchService

    - Implement `searchStatutes()` method (full-text search)
    - Implement `getStatuteDetail()` method
    - Implement `getRelatedCases()` method (KAG)
    - Implement `getSearchHistory()` method
    - _Requirements: Statute search operations_


  - [x] 7.2 Create GET /api/laws/search endpoint
    - Accept query, jurisdiction, severity, category, limit parameters


    - Support guest and authenticated users

    - Implement full-text search using pgvector
    - Return paginated results with relevance scores
    - Log search history (auth only)
    - _Requirements: Statute search (guest + auth)_


  - [x] 7.3 Create GET /api/laws/:code endpoint
    - Return statute detail with full text



    - Include metadata (jurisdiction, severity, category, year)

    - Call RAGService for context retrieval
    - Return related cases (KAG)
    - _Requirements: Statute detail with RAG context_

  - [x] 7.4 Create GET /api/laws/:code/related-cases endpoint
    - Query Neo4j for related cases

    - Return top 5 cases with relevance scores
    - Include case metadata
    - _Requirements: Related cases (KAG)_

  - [x] 7.5 Create GET /api/citations/search-history endpoint

    - Return user's search history
    - Accept limit and offset parameters
    - Auth required
    - _Requirements: Search history tracking_

- [x] 8. Extend RAGService for statute search

  - [x] 8.1 Add `retrieveStatuteContext()` method
    - Query pgvector for statute embeddings
    - Return top 5 statutes with context
    - Include jurisdiction and severity filters
    - _Requirements: RAG context retrieval_


  - [x] 8.2 Add `rankByRelevance()` method
    - Rank results by similarity score
    - Return sorted results
    - _Requirements: Relevance ranking_


- [x] 9. Extend GraphService for related cases

  - [x] 9.1 Add `findRelatedCases()` method
    - Query Neo4j for cases with same statutes
    - Return top 5 cases with relevance scores
    - Include case metadata

    - _Requirements: Related cases query_


  - [x] 9.2 Add `rankCasesByRelevance()` method
    - Rank cases by number of shared statutes
    - Return sorted results
    - _Requirements: Case ranking_


- [x] 10. Create statute search page
  - [x] 10.1 Create StatuteSearchPage.svelte
    - Search bar with filters
    - Display search results
    - Show statute detail on selection

    - Show related cases sidebar
    - _Requirements: Statute search UI_

  - [x] 10.2 Create StatuteSearchBar.svelte
    - Search input
    - Filter controls (jurisdiction, severity, category)
    - Search button
    - _Requirements: Search input UI_

  - [x] 10.3 Create StatuteResultsList.svelte
    - Display search results
    - Show statute code, title, jurisdiction, severity
    - Show relevance score
    - Click to view detail
    - _Requirements: Results list UI_

  - [x] 10.4 Create StatuteDetail.svelte
    - Display statute full text
    - Show metadata
    - Show related cases
    - Provide "Attach to Case" button
    - _Requirements: Statute detail UI_



  - [x] 10.5 Create RelatedCasesPanel.svelte
    - Display related cases
    - Show case number, charges, outcome
    - Show relevance score
    - Link to case detail

    - _Requirements: Related cases UI_

- [x] 11. Update /laws route to use new search
  - [x] 11.1 Integrate StatuteSearchPage into /laws
    - Replace old jurisdiction browse with new search
    - Support guest and auth modes

    - Show search history for auth users

    - _Requirements: Route integration_

- [x] 12. Write unit tests for statute search
  - [x] 12.1 Test StatuteSearchService
    - Test search, detail, related cases operations
    - Test filtering and ranking

    - Test error handling
    - _Requirements: Service testing_

  - [x] 12.2 Test statute search API endpoints
    - Test GET /api/laws/search
    - Test GET /api/laws/:code
    - Test GET /api/laws/:code/related-cases
    - Test GET /api/citations/search-history

    - _Requirements: API testing_

  - [x] 12.3 Test statute search components
    - Test StatuteSearchPage
    - Test StatuteSearchBar

    - Test StatuteResultsList
    - Test StatuteDetail
    - Test RelatedCasesPanel
    - _Requirements: Component testing_


---

## Sprint S-C: Citation → Case Linking (Week 5-6)


- [x] 13. Set up case-statute linking database schema

  - [x] 13.1 Create `case_statute_links` table
    - Fields: id, case_id, statute_code, linked_by, link_type, notes, created_at
    - Indexes: case_id, statute_code
    - Foreign keys: case_id, linked_by

    - _Requirements: Case-statute relationship storage_

  - [x] 13.2 Create database migration

    - Run migration on PostgreSQL
    - Verify indexes created
    - _Requirements: Database setup_



- [x] 14. Implement case-statute linking API
  - [x] 14.1 Create CaseLinkService
    - Implement `linkStatuteToCase()` method
    - Implement `getCaseStatutes()` method
    - Implement `unlinkStatute()` method
    - Implement `updateLinkMetadata()` method

    - _Requirements: Link CRUD operations_

  - [x] 14.2 Create POST /api/cases/:id/laws endpoint
    - Accept statute_code, link_type, notes parameters
    - Validate input

    - Create link in database

    - Create relationship in Neo4j

    - Log audit event
    - Return created link
    - _Requirements: Create case-statute link_


  - [x] 14.3 Create GET /api/cases/:id/laws endpoint
    - Return case's linked statutes
    - Include metadata and notes

    - Support filtering by link_type

    - _Requirements: Get case statutes_

  - [x] 14.4 Create DELETE /api/cases/:id/laws/:statute_code endpoint
    - Delete link from database

    - Delete relationship from Neo4j
    - Log audit event
    - _Requirements: Delete case-statute link_

  - [x] 14.5 Create PUT /api/cases/:id/laws/:statute_code endpoint
    - Update link metadata
    - Update notes
    - Log changes
    - _Requirements: Update case-statute link_



- [x] 15. Extend GraphService for case-statute relationships
  - [x] 15.1 Add `createCaseStatuteRelationship()` method
    - Create (Case) -[CHARGED_UNDER]-> (Statute) relationship
    - Set relationship properties (link_type, notes)
    - _Requirements: Neo4j relationship creation_


  - [x] 15.2 Add `deleteCaseStatuteRelationship()` method
    - Delete relationship from Neo4j
    - _Requirements: Neo4j relationship deletion_

  - [x] 15.3 Add `getCaseStatuteRelationships()` method

    - Query Neo4j for case's statute relationships
    - Return with metadata


    - _Requirements: Neo4j relationship query_


- [x] 16. Create case-statute linking components
  - [x] 16.1 Create AttachToCaseModal.svelte
    - Modal for selecting case to attach statute to
    - Show user's active cases

    - Allow selecting link_type
    - Allow adding notes
    - _Requirements: Case selector UI_

  - [x] 16.2 Create CaseStatuteLinks.svelte

    - Display list of linked statutes for case
    - Show statute code, title, link_type, notes
    - Provide edit/delete buttons
    - _Requirements: Linked statutes list UI_


  - [x] 16.3 Create LinkMetadataForm.svelte
    - Form for editing link metadata
    - Input fields for link_type and notes
    - Save button
    - _Requirements: Link metadata editor UI_

- [x] 17. Integrate linking into statute search
  - [x] 17.1 Add "Attach to Case" button to StatuteDetail.svelte

    - Show button when statute is selected

    - Open AttachToCaseModal on click
    - _Requirements: Attach button in statute detail_

  - [x] 17.2 Add "Attach to Case" button to CitationDetail.svelte
    - Show button for saved citations
    - Open AttachToCaseModal on click
    - _Requirements: Attach button in citation detail_

- [x] 18. Integrate linking into case detail

  - [x] 18.1 Add "Linked Statutes" tab to CaseDetailPage.svelte
    - Show CaseStatuteLinks component
    - Allow adding new links
    - _Requirements: Linked statutes tab in case detail_

  - [x] 18.2 Add "Attach Statute" button to CaseDetailPage.svelte

    - Open statute search modal
    - Allow selecting statute to attach
    - _Requirements: Attach statute button in case detail_


- [x] 19. Write unit tests for case-statute linking
  - [x] 19.1 Test CaseLinkService
    - Test link, get, unlink, update operations
    - Test validation


    - Test error handling

    - _Requirements: Service testing_

  - [x] 19.2 Test case-statute linking API endpoints

    - Test POST /api/cases/:id/laws

    - Test GET /api/cases/:id/laws
    - Test DELETE /api/cases/:id/laws/:statute_code
    - Test PUT /api/cases/:id/laws/:statute_code

    - _Requirements: API testing_



  - [x] 19.3 Test case-statute linking components
    - Test AttachToCaseModal

    - Test CaseStatuteLinks
    - Test LinkMetadataForm

    - _Requirements: Component testing_

---

## Sprint S-D: Citation Library (Week 7-8)


- [x] 20. Set up citation library database schema
  - [x] 20.1 Create `citation_collections` table
    - Fields: id, user_id, name, description, is_public, created_at, updated_at
    - Indexes: user_id

    - Foreign key: user_id
    - _Requirements: Collection storage_

  - [x] 20.2 Create `citation_tags` table
    - Fields: id, citation_id, tag, created_at

    - Indexes: citation_id, tag
    - Foreign key: citation_id
    - _Requirements: Tag storage_

  - [x] 20.3 Create `collection_citations` table

    - Fields: id, collection_id, citation_id, added_at

    - Indexes: collection_id, citation_id
    - Foreign keys: collection_id, citation_id
    - _Requirements: Collection membership storage_


  - [x] 20.4 Create database migrations
    - Run migrations on PostgreSQL
    - Verify indexes created

    - _Requirements: Database setup_


- [x] 21. Implement citation library API
  - [x] 21.1 Create CitationLibraryService
    - Implement `createCollection()` method
    - Implement `getCollections()` method
    - Implement `getCollectionDetail()` method

    - Implement `addCitationToCollection()` method
    - Implement `removeCitationFromCollection()` method
    - Implement `addTag()` method
    - Implement `removeTag()` method

    - _Requirements: Library CRUD operations_


  - [x] 21.2 Create POST /api/citations/collections endpoint
    - Accept name, description, is_public parameters
    - Create collection
    - Log audit event

    - Return created collection
    - _Requirements: Create collection_

  - [x] 21.3 Create GET /api/citations/collections endpoint
    - Return user's collections
    - Support filtering by is_public
    - _Requirements: List collections_

  - [x] 21.4 Create GET /api/citations/collections/:id endpoint
    - Return collection detail with citations

    - Include citation metadata
    - _Requirements: Get collection detail_

  - [x] 21.5 Create POST /api/citations/collections/:id/citations endpoint
    - Add citation to collection
    - Log audit event
    - _Requirements: Add citation to collection_

  - [x] 21.6 Create DELETE /api/citations/collections/:id/citations/:citation_id endpoint
    - Remove citation from collection

    - Log audit event

    - _Requirements: Remove citation from collection_

  - [x] 21.7 Create POST /api/citations/:id/tags endpoint
    - Add tag to citation
    - Log audit event
    - _Requirements: Add tag_


  - [x] 21.8 Create DELETE /api/citations/:id/tags/:tag endpoint
    - Remove tag from citation
    - Log audit event
    - _Requirements: Remove tag_


- [x] 22. Implement export functionality
  - [x] 22.1 Create ExportService
    - Implement `exportToPDF()` method
    - Implement `exportToJSON()` method

    - Implement `exportToCSV()` method

    - _Requirements: Export operations_

  - [x] 22.2 Create POST /api/citations/export endpoint
    - Accept format, collection_id, citation_ids parameters

    - Generate export file
    - Return download URL or file
    - Log audit event
    - _Requirements: Export citations_


- [x] 23. Create citation library components
  - [x] 23.1 Create CitationLibraryPage.svelte

    - Main library page

    - Show collections and citations
    - Provide search and filter
    - _Requirements: Library main page_

  - [x] 23.2 Create CitationCollections.svelte

    - Display list of collections
    - Show collection name, description, citation count
    - Provide create/edit/delete buttons
    - _Requirements: Collections list UI_

  - [x] 23.3 Create CollectionDetail.svelte
    - Display collection detail
    - Show citations in collection


    - Provide add/remove citation buttons

    - _Requirements: Collection detail UI_

  - [x] 23.4 Create CitationTags.svelte
    - Display tags for citation

    - Allow adding/removing tags
    - Show tag suggestions
    - _Requirements: Tag management UI_


  - [x] 23.5 Create ExportModal.svelte
    - Modal for exporting citations
    - Select format (PDF, JSON, CSV)
    - Select citations or collection
    - Export button
    - _Requirements: Export UI_

- [x] 24. Create citation library page
  - [x] 24.1 Create /citations route
    - Render CitationLibraryPage
    - Auth required
    - _Requirements: Citation library page_

  - [x] 24.2 Integrate into navigation
    - Add "Citations" link to sidebar
    - Update navigation menu
    - _Requirements: Navigation integration_

- [x] 25. Implement sharing functionality
  - [x] 25.1 Create sharing API
    - POST /api/citations/collections/:id/share
    - Accept user_id or email parameter
    - Create share record
    - Log audit event
    - _Requirements: Share collection_

  - [x] 25.2 Create sharing UI
    - Add "Share" button to CollectionDetail
    - Show sharing modal
    - Display shared users
    - _Requirements: Share UI_

- [x] 26. Write unit tests for citation library
  - [x] 26.1 Test CitationLibraryService
    - Test collection, tag, export operations
    - Test validation
    - Test error handling
    - _Requirements: Service testing_

  - [x] 26.2 Test citation library API endpoints
    - Test POST /api/citations/collections
    - Test GET /api/citations/collections
    - Test GET /api/citations/collections/:id
    - Test POST /api/citations/collections/:id/citations
    - Test DELETE /api/citations/collections/:id/citations/:citation_id
    - Test POST /api/citations/:id/tags
    - Test DELETE /api/citations/:id/tags/:tag
    - Test POST /api/citations/export
    - _Requirements: API testing_

  - [x] 26.3 Test citation library components
    - Test CitationLibraryPage
    - Test CitationCollections
    - Test CollectionDetail
    - Test CitationTags
    - Test ExportModal
    - _Requirements: Component testing_

---

## Integration & Testing

- [x] 27. Integration testing
  - [x] 27.1 Test end-to-end citation save → search → link
    - Save citation manually
    - Search for statute
    - Link statute to case
    - Verify in case detail
    - _Requirements: E2E workflow_

  - [x] 27.2 Test auto-save from summary
    - Generate summary
    - Verify citations auto-saved
    - Search for auto-saved citations
    - _Requirements: Auto-save workflow_

  - [x] 27.3 Test citation library workflow
    - Create collection
    - Add citations to collection
    - Add tags
    - Export collection
    - _Requirements: Library workflow_

- [x] 28. Performance testing
  - [x] 28.1 Test citation save latency
    - Target: <500ms
    - Measure API response time
    - _Requirements: Performance benchmark_

  - [x] 28.2 Test statute search latency
    - Target: <2s
    - Measure query + RAG time
    - _Requirements: Performance benchmark_

  - [x] 28.3 Test related cases query latency
    - Target: <3s
    - Measure Neo4j query time
    - _Requirements: Performance benchmark_

- [x] 29. Security & audit testing
  - [x] 29.1 Test authorization
    - Verify guest can search statutes
    - Verify auth required for saving citations
    - Verify auth required for library access
    - _Requirements: Authorization testing_

  - [x] 29.2 Test audit logging
    - Verify all operations logged
    - Verify user_id tracked
    - Verify timestamps recorded
    - _Requirements: Audit logging testing_

---

## Documentation

- [x] 30. Update documentation
  - [x] 30.1 Update API documentation
    - Document all new endpoints
    - Include request/response examples
    - _Requirements: API docs_

  - [x] 30.2 Update design system
    - Add new components
    - Update color usage
    - _Requirements: Design docs_

  - [x] 30.3 Create Phase 2 completion summary
    - Document all deliverables
    - Include performance metrics
    - _Requirements: Completion docs_

---

## Summary

**Total Tasks**: 30 main tasks with 100+ subtasks
**Duration**: 8 weeks (4 sprints)
**Status**: Ready for implementation
**Builds On**: Phase 1 (Case Reporter Summarizer) ✅ COMPLETE

**Sprint Breakdown:**
- S-A (Week 1-2): Citation Management - 6 tasks
- S-B (Week 3-4): Statute Search - 6 tasks
- S-C (Week 5-6): Citation → Case Linking - 6 tasks
- S-D (Week 7-8): Citation Library - 6 tasks
- Integration & Testing: 4 tasks
- Documentation: 1 task

**Next Step**: Begin Sprint S-A (Citation Management)

