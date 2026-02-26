# Implementation Plan: API Route Corruption Cleanup

## Overview

This plan converts the API cleanup design into actionable implementation tasks. Each task builds incrementally, starting with scanning and analysis, moving to automated fixes, and concluding with validation and reporting.

---

- [x] 1. Set up cleanup infrastructure and scanning framework



  - Create cleanup utility directory structure: `scripts/api-cleanup/`
  - Implement file scanner that recursively finds all `+server.ts` files in `sveltekit-frontend/src/routes/api/`
  - Create error detection logic to identify syntax errors, malformed imports, and type issues
  - Build manifest data structure to store scan results

  - _Requirements: 1.1, 1.2_

- [ ] 1.1 Write unit tests for scanner
  - Test scanner identifies all files in directory
  - Test scanner detects syntax errors correctly


  - Test scanner categorizes error types accurately
  - _Requirements: 1.1, 1.2_

- [ ] 2. Implement file categorization system
  - Create categorizer that classifies files as core, experimental, test, or phase-specific

  - Implement priority scoring based on directory structure and file importance
  - Add backup file detection (files with `.disabled` or `_disabled` suffix)
  - Generate categorized manifest with all metadata
  - _Requirements: 2.1, 2.2, 2.3_



- [ ] 2.1 Write unit tests for categorizer
  - Test core routes are identified correctly
  - Test experimental routes are marked appropriately
  - Test backup files are detected
  - _Requirements: 2.1, 2.2_


- [ ] 3. Implement data recovery from backup files
  - Scan for disabled/backup files (`.disabled`, `_disabled` suffixes)
  - Extract code content from backup files
  - Validate extracted code against TypeScript compiler


  - Restore valid data to corresponding active route files
  - Create recovery log documenting all restored data
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3.1 Write property test for data recovery
  - **Feature: api-cleanup-corruption-fix, Property 3: Data Recovery Preserves Functionality**

  - **Validates: Requirements 3.3, 3.4**
  - For any recovered data, verify it passes TypeScript compilation

- [x] 4. Implement automated syntax error fixes


  - Create fix engine that identifies common patterns (missing semicolons, malformed imports, invalid types)
  - Implement fixes for: missing semicolons, duplicate imports, malformed type annotations
  - Apply fixes to corrupted files
  - Validate corrected code against TypeScript compiler
  - Document all fixes applied
  - _Requirements: 4.1, 4.2, 4.3_


- [ ] 4.1 Write property test for automated fixes
  - **Feature: api-cleanup-corruption-fix, Property 4: Automated Fixes Maintain Semantics**
  - **Validates: Requirements 4.2, 4.3**

  - For any fixed file, verify corrected code is semantically equivalent

- [ ] 5. Implement safe file disabling for unfixable routes
  - Create disabler that renames unfixable files with `.disabled` suffix


  - Scan entire codebase for imports of disabled files
  - Update all imports to use fallback endpoints or remove them
  - Create disable log documenting all disabled files and why
  - Verify no broken imports remain
  - _Requirements: 5.1, 5.2, 5.3, 5.4_


- [ ] 5.1 Write property test for disabled file isolation
  - **Feature: api-cleanup-corruption-fix, Property 1: No Broken Imports After Cleanup**
  - **Validates: Requirements 5.3**


  - For any disabled file, verify no active routes import from it

- [ ] 5.2 Write property test for disabled file inaccessibility
  - **Feature: api-cleanup-corruption-fix, Property 2: Disabled Files Are Inaccessible**
  - **Validates: Requirements 5.1**
  - For any file with `.disabled` suffix, verify SvelteKit router does not load it


- [ ] 6. Implement build validation
  - Run `npm run build` after cleanup operations
  - Capture esbuild output and parse for errors


  - Categorize remaining errors by type
  - Generate error report with remediation suggestions
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 6.1 Write integration test for build validation





  - Test build succeeds after cleanup on test directory
  - Verify no esbuild errors related to corrupted files
  - _Requirements: 6.1, 6.2_

- [x] 7. Implement comprehensive reporting system


  - Create report generator that documents all cleanup operations
  - Generate corruption manifest with file-by-file analysis
  - Generate cleanup report with statistics and changes
  - Create recovery guide for disabled files
  - Export reports as JSON and markdown
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 7.1 Write property test for manifest completeness
  - **Feature: api-cleanup-corruption-fix, Property 6: Manifest Completeness**
  - **Validates: Requirements 1.3, 1.4**
  - For any corrupted file, verify it appears in manifest with categorization

- [ ] 8. Integrate cleanup pipeline into main workflow
  - Create main cleanup script that orchestrates all components
  - Implement command-line interface for running cleanup
  - Add configuration options for selective cleanup (core only, experimental only, etc.)
  - Create pre-cleanup backup of entire API directory
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

- [x] 9. Execute cleanup on actual codebase
  - Run full cleanup pipeline on `sveltekit-frontend/src/routes/api/`
  - Review generated reports and categorization
  - Manually verify critical fixes and disabled files
  - Document any manual interventions needed
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

- [ ] 10. Categorize routes for production
  - Identify core production routes (30-40 routes)
  - Mark experimental routes for potential disabling
  - Mark test/debug routes for disabling
  - Create production route strategy document
  - _Requirements: 1.1, 2.1, 2.2_

- [ ] 11. Fix core production routes
  - Create production route fixer tool
  - Fix all core routes with error handling
  - Add authentication checks
  - Add input validation
  - Ensure SvelteKit 2 compatibility
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 12. Configure Docker & environment
  - Create production .env file
  - Update docker-compose.yml with proper configuration
  - Configure health checks for all services
  - Set up logging and monitoring
  - _Requirements: 1.1, 6.1, 6.2_

- [ ] 13. Verify SvelteKit 2 compatibility
  - Check all routes use +server.ts pattern
  - Verify proper request/response handling
  - Add type safety to all routes
  - Run type checking and linting
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 14. Test all API endpoints
  - Run comprehensive endpoint tests
  - Verify error handling
  - Check authentication/authorization
  - Validate response formats
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 15. Validate build success
  - Run `npm run build` from sveltekit-frontend directory
  - Verify build completes without esbuild errors
  - Capture build output and verify no API-related errors
  - Document final status
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Create recovery documentation
  - Document all disabled files and recovery procedures
  - Create guide for re-enabling specific routes if needed
  - Document backup locations and recovery steps
  - Create troubleshooting guide for common issues
  - _Requirements: 7.3, 7.4_

