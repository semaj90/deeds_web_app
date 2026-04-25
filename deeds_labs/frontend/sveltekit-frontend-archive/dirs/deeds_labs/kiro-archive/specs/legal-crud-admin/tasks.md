# Legal CRUD Admin Implementation Plan

## Overview

This implementation plan converts the Legal CRUD Admin design into discrete, actionable coding tasks. Each task builds incrementally on previous tasks, with no orphaned code.

## Implementation Tasks

- [ ] 1. Database Schema and Migrations
  - [ ] 1.1 Create Drizzle ORM schema for statutes table
    - Define all editable fields with proper types and constraints
    - Add validation rules (citation_number pattern, jurisdiction enum, authority_type enum)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 1.2 Create Drizzle ORM schema for audit_log table
    - Define immutable audit log structure with user_id, operation, old_values, new_values
    - Add indexes for efficient querying
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 1.3 Create database migration for statutes and audit_log tables
    - Generate migration file with CREATE TABLE statements
    - Add indexes for jurisdiction, citation_number, authority_type
    - _Requirements: 1.1, 6.1_

  - [ ] 1.4 Create Drizzle ORM schema for embeddings table (update existing)
    - Add embedding_model and metadata fields (editable)
    - Mark embedding vector as read-only in schema
    - _Requirements: 4.1, 4.2_

- [ ] 2. Backend Validation and CRUD Routes
  - [ ] 2.1 Create validation module for legal constraints
    - Implement citation_number pattern validation (§ 123, §123(a)(1), etc.)
    - Implement jurisdiction enum validation (CA, NY, TX, Fed-US, Other)
    - Implement authority_type enum validation (Statute, Case, Regulation, Constitution)
    - Implement URL validation for source_url
    - Implement year range validation (1900-2100)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 2.2 Create audit logging service
    - Implement function to log CREATE operations (user_id, timestamp, resource_id, new_values)
    - Implement function to log UPDATE operations (user_id, timestamp, resource_id, old_values, new_values)
    - Implement function to log DELETE operations (user_id, timestamp, resource_id, deleted_values)
    - Ensure audit log entries are immutable (no updates/deletes)
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 2.3 Create FastAPI routes for statutes CRUD
    - Implement GET /api/statutes (with pagination, filtering, sorting)
    - Implement POST /api/statutes (with validation and audit logging)
    - Implement PATCH /api/statutes/{id} (with validation and audit logging)
    - Implement DELETE /api/statutes/{id} (with audit logging)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3_

  - [ ] 2.4 Create FastAPI routes for embeddings management
    - Implement GET /api/embeddings/{id} (read-only vector preview)
    - Implement PATCH /api/embeddings/{id} (allow only embedding_model and metadata)
    - Implement POST /api/embeddings/{id}/regenerate (call embedding service, update vector)
    - Reject direct vector edits with HTTP 400
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 2.5 Create FastAPI routes for audit log queries
    - Implement GET /api/audit (with filtering by resource_type, resource_id, user_id, date_range)
    - Ensure audit log is read-only (no POST/PATCH/DELETE)
    - _Requirements: 6.4, 6.5_

- [ ] 3. Frontend Components - Navigation and Layout
  - [ ] 3.1 Create AdminSidebar component
    - Display navigation sections: Evidence, Chunks, Vector, Citations, KAG Links, Audit
    - Highlight active section based on current route
    - Apply YoRHa-style dark theme (background #111, text #ddd, accent #9df)
    - _Requirements: 3.1_

  - [ ] 3.2 Create admin layout wrapper
    - Implement grid layout: sidebar (240px) + main content (1fr)
    - Ensure sidebar is sticky/fixed
    - Apply consistent styling across all admin pages
    - _Requirements: 3.1_

- [ ] 4. Frontend Components - Data Display
  - [ ] 4.1 Create DataGrid component
    - Display paginated table with sortable columns
    - Implement search/filter functionality
    - Add row click handler to open drawer
    - Display loading state during data fetch
    - _Requirements: 3.2_

  - [ ] 4.2 Create pagination controls
    - Display current page, total pages, page size selector
    - Implement next/previous/goto page functionality
    - _Requirements: 3.2_

  - [ ] 4.3 Create search/filter bar
    - Implement text search across searchable columns
    - Implement jurisdiction filter dropdown
    - Implement authority_type filter dropdown
    - _Requirements: 3.2, 2.1_

- [ ] 5. Frontend Components - CRUD Forms
  - [ ] 5.1 Create StatuteDrawer component
    - Display form fields: title, citation_number, jurisdiction, authority_type, section_id, chapter, revision_year, source_url, tags
    - Implement real-time validation with error messages
    - Implement submit and cancel buttons
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 5.2 Create form validation UI
    - Display validation errors below each field
    - Disable submit button until form is valid
    - Show success message after save
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 5.3 Create EmbeddingDrawer component
    - Display read-only vector preview (768-dim)
    - Display editable embedding_model and metadata fields
    - Implement regenerate button
    - Show regeneration status/progress
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Frontend Components - Jurisdiction Control
  - [ ] 6.1 Create JurisdictionSelector component
    - Display required dropdown with options: CA, NY, TX, Fed-US, Other
    - Disable all CRUD operations when unselected
    - Show visual indicator of required field
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 6.2 Integrate jurisdiction selector into admin layout
    - Place jurisdiction selector prominently (top of page)
    - Disable DataGrid and CRUD operations when unselected
    - Clear search results when jurisdiction changes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 7. Frontend Pages - Admin Sections
  - [ ] 7.1 Create /admin/statutes page
    - Integrate AdminSidebar, JurisdictionSelector, DataGrid, StatuteDrawer
    - Implement data fetching with pagination and filtering
    - Wire up row click to open drawer
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2_

  - [ ] 7.2 Create /admin/embeddings page
    - Integrate AdminSidebar, JurisdictionSelector, DataGrid, EmbeddingDrawer
    - Display embedding metadata and vector preview
    - Implement regenerate functionality
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 7.3 Create /admin/audit page
    - Integrate AdminSidebar, DataGrid (read-only)
    - Display audit log entries with filters
    - Show operation type, user_id, timestamp, changes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Integration and Testing
  - [ ] 8.1 Create unit tests for validation functions
    - Test citation_number pattern validation (valid and invalid formats)
    - Test jurisdiction enum validation
    - Test authority_type enum validation
    - Test URL validation
    - Test year range validation
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 8.2 Create unit tests for CRUD operations
    - Test create statute with valid data
    - Test create statute with invalid data (rejected)
    - Test update statute fields
    - Test delete statute
    - Test query with filters and pagination
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 8.3 Create unit tests for audit logging
    - Test CREATE operation logging
    - Test UPDATE operation logging with old/new values
    - Test DELETE operation logging
    - Test audit log immutability
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 8.4 Create integration tests for full CRUD flow
    - Test create statute → read → update → delete
    - Verify audit trail for all operations
    - Test jurisdiction filtering
    - Test vector regeneration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3_

- [ ]* 8.5 Create UI tests for form validation and datagrid
    - Test form validation displays errors
    - Test submit button disabled until valid
    - Test datagrid search filters results
    - Test datagrid pagination works
    - Test row click opens drawer
    - _Requirements: 3.1, 3.2, 5.1, 5.2_

