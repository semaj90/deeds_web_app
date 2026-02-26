# Requirements Document

## Introduction

This specification addresses the comprehensive testing and remediation of the YoRHa Legal AI Platform's SvelteKit frontend. The system currently has 3790 svelte-check errors and 102 warnings across 555 files, blocking production deployment and user flow testing. This spec focuses on systematic error remediation, end-to-end user flow testing with evidence upload to MinIO, route verification, and UI/UX alignment with bits-ui components for Svelte 5 runes.

## Glossary

- **Svelte_Check**: The official Svelte validation tool that checks TypeScript and Svelte syntax
- **Bits_UI**: A headless component library for Svelte 5 with runes-based reactivity
- **MinIO**: S3-compatible object storage used for evidence file storage
- **SSR**: Server-Side Rendering, wired to legal_ai_db via +page.server.ts
- **Runes**: Svelte 5's new reactivity system using $state, $derived, $effect
- **User_Flow**: Complete workflow from login through case creation to evidence upload
- **Route_Testing**: Verification that all SvelteKit routes and button mappings work correctly

## Requirements

### Requirement 1: Systematic Error Remediation

**User Story:** As a developer, I want all TypeScript and Svelte 5 errors fixed systematically, so that the codebase compiles cleanly and can be deployed to production.

#### Acceptance Criteria

1. WHEN running svelte-check THEN the System SHALL report fewer than 500 errors (down from 3790)
2. WHEN bits-ui components are used THEN the System SHALL use Svelte 5 runes syntax (Button.Root, Dialog.Root, etc.)
3. WHEN accessibility warnings exist (a11y_label_has_associated_control) THEN the System SHALL fix them with proper label associations
4. WHEN import/type errors exist THEN the System SHALL fix import paths and type annotations
5. WHEN corrupted syntax patterns exist (colon-chain corruption) THEN the System SHALL apply multi-pass repair patterns
6. IF a file cannot be automatically fixed THEN the System SHALL log the file for manual review

### Requirement 2: User Flow Testing with Evidence Upload

**User Story:** As a QA engineer, I want to test the complete user workflow from login to evidence upload, so that I can verify the system works end-to-end.

#### Acceptance Criteria

1. WHEN a user visits the login page THEN the System SHALL display a functional login form
2. WHEN valid credentials are submitted THEN the System SHALL authenticate the user and redirect to dashboard
3. WHEN a user clicks "+ NEW CASE" THEN the System SHALL display a case creation form
4. WHEN a case is created THEN the System SHALL persist it to the database and display confirmation
5. WHEN a user uploads evidence files THEN the System SHALL store them in the MinIO bucket
6. WHEN evidence is uploaded THEN the System SHALL display the saved data correctly in the UI
7. WHEN each step completes successfully THEN the System SHALL capture a screenshot for verification

### Requirement 3: Route and Button Mapping Verification

**User Story:** As a developer, I want all routes and button mappings verified, so that navigation works correctly throughout the application.

#### Acceptance Criteria

1. WHEN the homepage loads THEN the System SHALL display all navigation buttons correctly
2. WHEN a navigation button is clicked THEN the System SHALL route to the correct page
3. WHEN the dashboard route is accessed THEN the System SHALL load the dashboard component
4. WHEN the cases route is accessed THEN the System SHALL load the cases list
5. WHEN the evidence route is accessed THEN the System SHALL load the evidence board
6. IF a route fails to load THEN the System SHALL display an appropriate error message
7. WHEN testing routes THEN the System SHALL verify all button press handlers are properly mapped

### Requirement 4: Homepage UI/UX Alignment

**User Story:** As a user, I want the homepage to match the intended UX design, so that I have a consistent and intuitive experience.

#### Acceptance Criteria

1. WHEN the homepage loads THEN the System SHALL display a "+ NEW CASE" button prominently
2. WHEN the homepage loads THEN the System SHALL display GLOBAL SEARCH in the sidebar (not main content)
3. WHEN bits-ui components are used THEN the System SHALL use Button.Root, Dialog.Root patterns
4. WHEN the UI renders THEN the System SHALL match the NES.css retro framework styling
5. WHEN the layout renders THEN the System SHALL use UnoCSS with Tailwind presets correctly

### Requirement 5: Backend Integration Verification

**User Story:** As a developer, I want to verify that the frontend correctly integrates with the backend services, so that data flows correctly through the system.

#### Acceptance Criteria

1. WHEN npm run dev:gpu is executed THEN the System SHALL launch the full backend stack (PostgreSQL, Redis, MinIO, Qdrant)
2. WHEN SSR loads THEN the System SHALL connect to legal_ai_db via +page.server.ts
3. WHEN evidence is uploaded THEN the System SHALL store files in the MinIO evidence bucket
4. WHEN data is saved THEN the System SHALL persist to PostgreSQL with pgvector extension
5. IF a backend service is unavailable THEN the System SHALL display a graceful error message

