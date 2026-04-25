# Evidence Files CRUD + RAG Integration Implementation Plan

## Overview

This implementation plan converts the Evidence Files CRUD + RAG Integration design into discrete, actionable coding tasks. Each task builds incrementally on previous tasks, with no orphaned code.

## Implementation Tasks

- [x] 1. Database Schema and Migrations

  - [x] 1.1 Create Drizzle ORM schema for evidence_files table

    - Define fields: filename, file_type, file_size, jurisdiction, processing_status, minio_path, metadata
    - Add validation rules (jurisdiction enum, file_type enum, processing_status enum)
    - Add indexes for jurisdiction, processing_status, file_type
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_


  - [x] 1.2 Create Drizzle ORM schema for citation_tags table


    - Define fields: name, jurisdiction, description
    - Add unique constraint on (name, jurisdiction)
    - Add index for jurisdiction
    - _Requirements: 2.1, 2.2, 2.3_



  - [x] 1.3 Create Drizzle ORM schema for evidence_tags M2M table
    - Define fields: evidence_id (FK), tag_id (FK)
    - Add composite primary key (evidence_id, tag_id)
    - Add indexes for both foreign keys
    - _Requirements: 2.1, 2.2, 2.3_
    - _Completed: December 13, 2025_

  - [x] 1.4 Create Drizzle ORM schema for rag_index_metadata table
    - Define fields: chunk_id (FK), evidence_id (FK), tags (array), tag_weight
    - Add indexes for chunk_id, evidence_id, tags
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5_
    - _Completed: December 13, 2025_

  - [x] 1.5 Create Drizzle ORM schema for audit_log table
    - Define fields: user_id, resource_type, resource_id, operation, old_values, new_values, timestamp
    - Add indexes for resource_type, resource_id, user_id
    - Mark timestamp as immutable (no updates)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    - _Completed: December 13, 2025_

  - [x] 1.6 Create database migration for all new tables


    - Generate migration file with CREATE TABLE statements
    - Add all indexes and constraints
    - _Requirements: 1.1, 2.1, 6.1, 7.1_



- [ ] 2. Backend Validation and CRUD Routes



  - [x] 2.1 Create validation module for evidence constraints
    - Implement jurisdiction enum validation (CA, NY, TX, Fed-US, Other)
    - Implement file_type enum validation (pdf, docx, txt)
    - Implement processing_status enum validation (pending, processing, completed, failed)
    - Implement file_size validation (max 100MB)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
    - _Completed: December 13, 2025_

  - [x] 2.2 Create audit logging service
    - Implement function to log CREATE operations (user_id, timestamp, resource_id, new_values)
    - Implement function to log UPDATE operations (user_id, timestamp, resource_id, old_values, new_values)
    - Implement function to log DELETE operations (user_id, timestamp, resource_id, deleted_values)
    - Ensure audit log entries are immutable (no updates/deletes)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    - _Completed: December 13, 2025_



  - [x] 2.3 Create FastAPI routes for evidence CRUD




    - Implement GET /api/evidence (with pagination, filtering, sorting)
    - Implement POST /api/evidence (multipart/form-data, store in MinIO, create record)
    - Implement PATCH /api/evidence/{id} (with validation and audit logging)
    - Implement DELETE /api/evidence/{id} (with audit logging)


    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3_

  - [x] 2.4 Create FastAPI routes for citation tags CRUD
    - Implement GET /api/tags (with jurisdiction filter)
    - Implement POST /api/tags (create new tag)
    - Implement PATCH /api/evidence/{id}/tags (update evidence_tags links)
    - Trigger RAG index update when tags change
    - _Requirements: 2.1, 2.2, 2.3, 7.2_
    - _Completed: December 13, 2025_



  - [x] 2.5 Create RAG index sync service
    - Implement function to add evidence chunks to RAG index with tag metadata
    - Implement function to update RAG index when tags change (apply 1.5x weight boost)
    - Implement function to remove chunks from RAG index when evidence deleted
    - Implement function to update RAG index when embeddings regenerated
    - Implement health check for RAG sync service
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
    - _Completed: December 11, 2025_




  - [x] 2.6 Create FastAPI routes for RAG search with tag filtering
    - Implement POST /api/rag/search (query, tags, jurisdiction)


    - Apply tag filter to Qdrant search
    - Apply jurisdiction filter to Qdrant search
    - Apply 1.5x weight boost to results matching tags
    - Return results with tag metadata (matchedTags)
    - Sort results by boosted score
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
    - _Completed: December 11, 2025_



  - [x] 2.7 Create FastAPI routes for audit log queries

    - Implement GET /api/audit (with filtering by resource_type, resource_id, user_id, date_range)
    - Ensure audit log is read-only (no POST/PATCH/DELETE)
    - _Requirements: 6.4, 6.5_
    - _Completed: December 13, 2025_

- [ ] 3. Frontend Components - Navigation and Layout
  - [ ] 3.1 Create AdminSidebar component
    - Display navigation sections: Evidence, Chunks, Embeddings, Citations, KAG Links, Audit
    - Highlight active section based on current route
    - Apply YoRHa-style dark theme (background #111, text #ddd, accent #9df)
    - _Requirements: 1.1_


  - [ ] 3.2 Create admin layout wrapper
    - Implement grid layout: sidebar (240px) + main content (1fr)
    - Ensure sidebar is sticky/fixed
    - Apply consistent styling across all admin pages
    - _Requirements: 1.1_

- [ ] 4. Frontend Components - Data Display
  - [ ] 4.1 Create EvidenceDataGrid component
    - Display paginated table with sortable columns: filename, file_type, file_size, processing_status, jurisdiction, created_at
    - Implement search/filter functionality
    - Add row click handler to open drawer
    - Display loading state during data fetch
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 4.2 Create pagination controls
    - Display current page, total pages, page size selector
    - Implement next/previous/goto page functionality
    - _Requirements: 1.1_

  - [ ] 4.3 Create filter bar for evidence
    - Implement jurisdiction filter dropdown
    - Implement processing_status filter dropdown
    - Implement file_type filter dropdown





    - Implement text search across filename and metadata
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_



- [ ] 5. Frontend Components - CRUD Forms
  - [ ] 5.1 Create EvidenceDrawer component
    - Display form fields: filename, file_type, jurisdiction, processing_status, minio_path, metadata
    - Implement real-time validation with error messages



    - Implement submit and cancel buttons
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 5.2 Create form validation UI
    - Display validation errors below each field
    - Disable submit button until form is valid
    - Show success message after save
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 5.3 Create TagSelector component (multi-select chips)
    - Display available tags as selectable chips
    - Allow creating new tags inline
    - Show selected tags with remove button
    - _Requirements: 2.1, 2.2, 2.3_




  - [ ] 5.4 Integrate TagSelector into EvidenceDrawer
    - Add citation_tags field to form
    - Trigger RAG index update when tags change
    - Display tag count and boost factor
    - _Requirements: 2.1, 2.2, 2.3, 7.2_

- [ ] 6. Frontend Components - Jurisdiction Control
  - [ ] 6.1 Create JurisdictionSelector component
    - Display required dropdown with options: CA, NY, TX, Fed-US, Other
    - Disable all CRUD operations when unselected
    - Show visual indicator of required field
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 6.2 Integrate jurisdiction selector into admin layout
    - Place jurisdiction selector prominently (top of page)
    - Disable DataGrid and CRUD operations when unselected
    - Clear search results when jurisdiction changes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Frontend Components - RAG Search Interface
  - [ ] 7.1 Create TagFilter component
    - Display multi-select dropdown for citation tags
    - Show available tags for selected jurisdiction
    - Display tag count and boost factor (1.5x)

    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 7.2 Create RAGQueryInterface component
    - Display query input field
    - Integrate JurisdictionSelector (required)
    - Integrate TagFilter (optional)
    - Display search results with tag highlights
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Frontend Pages - Admin Sections
  - [ ] 8.1 Create /admin/evidence page
    - Integrate AdminSidebar, JurisdictionSelector, EvidenceDataGrid, EvidenceDrawer


    - Implement data fetching with pagination and filtering
    - Wire up row click to open drawer
    - Wire up save/delete to update database
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5_



  - [ ] 8.2 Create /rag/query page
    - Integrate RAGQueryInterface
    - Implement search functionality with tag filtering
    - Display results with tag metadata and highlights
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_


  - [ ] 8.3 Create /admin/audit page
    - Integrate AdminSidebar, DataGrid (read-only)
    - Display audit log entries with filters
    - Show operation type, user_id, timestamp, changes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9. Integration and Testing
  - [x] 9.1 Create unit tests for validation functions
    - Test jurisdiction enum validation
    - Test file_type enum validation
    - Test processing_status enum validation
    - Test file_size validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
    - _Completed: December 13, 2025 - 35 tests passing_

  - [ ] 9.2 Create unit tests for CRUD operations
    - Test create evidence with valid data
    - Test create evidence with invalid data (rejected)
    - Test update evidence fields
    - Test delete evidence
    - Test query with filters and pagination
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 9.3 Create unit tests for tag operations
    - Test create tag
    - Test link tag to evidence
    - Test remove tag link
    - Test query tags by jurisdiction
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 9.4 Create unit tests for RAG index sync
    - Test add evidence chunks to RAG index
    - Test update RAG index when tags change
    - Test remove chunks from RAG index
    - Test tag weighting (1.5x boost)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 9.5 Create unit tests for audit logging
    - Test CREATE operation logging
    - Test UPDATE operation logging with old/new values
    - Test DELETE operation logging
    - Test audit log immutability
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 9.6 Create integration tests for full CRUD flow
    - Test create evidence → read → update tags → search with tags → delete
    - Verify audit trail for all operations
    - Verify RAG index updated correctly
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 9.7 Create UI tests for form validation and datagrid
    - Test form validation displays errors
    - Test submit button disabled until valid
    - Test datagrid search filters results
    - Test datagrid pagination works
    - Test row click opens drawer
    - Test tag filter affects search results
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5_

