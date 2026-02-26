# Requirements Document: API Route Corruption Cleanup

## Introduction

The SvelteKit frontend has accumulated hundreds of corrupted API route files in `sveltekit-frontend/src/routes/api/` directory. These files contain malformed TypeScript/JavaScript with syntax errors, corrupted imports, and invalid type definitions that prevent the application from building. The corruption appears to be from incomplete code generation, failed migrations, or data corruption during previous operations.

This spec addresses the systematic identification, categorization, and remediation of these corrupted files to restore build integrity.

## Glossary

- **Corrupted File**: A TypeScript/JavaScript file with syntax errors, malformed imports, or invalid code structure that prevents parsing
- **API Route**: A SvelteKit server endpoint file (`+server.ts`) that handles HTTP requests
- **Build Failure**: When `npm run build` fails due to esbuild unable to parse corrupted files
- **Placeholder File**: A file marked as disabled or backup that contains real data to be restored
- **Cleanup Strategy**: The approach to identify, categorize, and fix corrupted files

## Requirements

### Requirement 1: Identify and Categorize Corrupted Files

**User Story:** As a developer, I want to identify all corrupted API route files, so that I can understand the scope of the problem and prioritize fixes.

#### Acceptance Criteria

1. WHEN scanning the `sveltekit-frontend/src/routes/api/` directory THEN the system SHALL identify all files with syntax errors, malformed imports, or invalid type definitions
2. WHEN analyzing corrupted files THEN the system SHALL categorize them by corruption type (syntax errors, import issues, type definition problems, encoding issues)
3. WHEN categorizing files THEN the system SHALL generate a manifest listing all corrupted files with their corruption type and severity
4. WHEN generating the manifest THEN the system SHALL include file paths, line numbers of errors, and suggested remediation approach

### Requirement 2: Distinguish Between Core and Non-Core Routes

**User Story:** As a developer, I want to distinguish between core feature routes and experimental/test routes, so that I can prioritize fixing critical paths first.

#### Acceptance Criteria

1. WHEN analyzing the API directory structure THEN the system SHALL identify core routes (v1, evidence, search, legal, upload) versus experimental routes (test, demo, phase-specific)
2. WHEN categorizing routes THEN the system SHALL mark routes as either "core" (required for MVP) or "experimental" (optional/testing)
3. WHEN marking routes THEN the system SHALL preserve core routes and safely remove or disable experimental routes
4. WHEN removing experimental routes THEN the system SHALL create a backup manifest for potential recovery

### Requirement 3: Restore Data from Placeholder Files

**User Story:** As a developer, I want to restore real data from backup/placeholder files, so that I can recover functionality from disabled routes.

#### Acceptance Criteria

1. WHEN scanning for disabled files (marked with `.disabled` or `_disabled` suffix) THEN the system SHALL identify them as potential data sources
2. WHEN finding disabled files THEN the system SHALL extract any real data or configuration they contain
3. WHEN extracting data THEN the system SHALL restore it to the corresponding active route file
4. WHEN restoring data THEN the system SHALL validate that the restored code is syntactically correct

### Requirement 4: Fix Syntax and Type Errors

**User Story:** As a developer, I want to automatically fix common syntax errors in corrupted files, so that the build can proceed.

#### Acceptance Criteria

1. WHEN analyzing corrupted files THEN the system SHALL identify common patterns (missing semicolons, malformed imports, invalid type annotations)
2. WHEN identifying patterns THEN the system SHALL apply automated fixes for fixable errors (syntax corrections, import cleanup)
3. WHEN applying fixes THEN the system SHALL validate the corrected code against TypeScript compiler
4. WHEN validation fails THEN the system SHALL mark the file for manual review and document the specific issues

### Requirement 5: Remove or Disable Unfixable Routes

**User Story:** As a developer, I want to safely remove or disable routes that cannot be automatically fixed, so that the build can succeed.

#### Acceptance Criteria

1. WHEN a file cannot be automatically fixed THEN the system SHALL rename it with a `.disabled` suffix to prevent it from being imported
2. WHEN disabling a file THEN the system SHALL create a summary document explaining why it was disabled
3. WHEN disabling files THEN the system SHALL ensure no other files import from the disabled route
4. WHEN ensuring no imports THEN the system SHALL scan the codebase for references and update them to use fallback endpoints

### Requirement 6: Validate Build Success

**User Story:** As a developer, I want to validate that the cleanup process results in a successful build, so that I can confirm the fixes are effective.

#### Acceptance Criteria

1. WHEN cleanup is complete THEN the system SHALL run `npm run build` to validate the build succeeds
2. WHEN the build runs THEN the system SHALL capture any remaining errors and categorize them
3. WHEN errors remain THEN the system SHALL generate a report of remaining issues with remediation steps
4. WHEN the build succeeds THEN the system SHALL generate a completion report with statistics on files fixed/removed

### Requirement 7: Document Cleanup Process and Results

**User Story:** As a developer, I want comprehensive documentation of the cleanup process, so that I can understand what was changed and why.

#### Acceptance Criteria

1. WHEN cleanup completes THEN the system SHALL generate a detailed report of all changes made
2. WHEN generating the report THEN the system SHALL include file-by-file changes, categorization, and remediation approach
3. WHEN documenting changes THEN the system SHALL create a recovery guide for disabled files
4. WHEN creating the guide THEN the system SHALL include instructions for re-enabling or recovering specific routes if needed

