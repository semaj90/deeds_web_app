# Design Document: API Route Corruption Cleanup

## Overview

This design addresses systematic identification, categorization, and remediation of corrupted API route files in the SvelteKit frontend. The approach combines automated scanning, intelligent categorization, data recovery from backups, and safe removal of unfixable routes.

## Architecture

### High-Level Flow

```
Scan API Directory
    ↓
Identify Corrupted Files
    ↓
Categorize by Type & Severity
    ↓
Check for Disabled/Backup Files
    ↓
Attempt Automated Fixes
    ↓
Validate Fixes
    ↓
Disable Unfixable Files
    ↓
Run Build Validation
    ↓
Generate Reports
```

### Components

1. **Scanner**: Identifies all files in `sveltekit-frontend/src/routes/api/` and checks for syntax errors
2. **Categorizer**: Classifies files by corruption type and route importance (core vs experimental)
3. **DataRecovery**: Searches for disabled/backup files and extracts real data
4. **AutoFixer**: Applies automated corrections to common syntax errors
5. **Validator**: Checks corrected code against TypeScript compiler
6. **Disabler**: Safely renames unfixable files and updates imports
7. **BuildValidator**: Runs build process and captures remaining errors
8. **Reporter**: Generates comprehensive documentation of changes

## Components and Interfaces

### Scanner Component

**Purpose**: Identify all corrupted files in the API directory

**Interface**:
```typescript
interface ScanResult {
  totalFiles: number;
  corruptedFiles: CorruptedFile[];
  scanTimestamp: Date;
}

interface CorruptedFile {
  path: string;
  errorType: 'syntax' | 'import' | 'type' | 'encoding' | 'unknown';
  errorMessage: string;
  lineNumber: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
```

### Categorizer Component

**Purpose**: Classify files by importance and corruption type

**Interface**:
```typescript
interface CategorizedFile extends CorruptedFile {
  category: 'core' | 'experimental' | 'test' | 'phase-specific';
  priority: number; // 1-10, higher = more important
  hasBackup: boolean;
  backupPath?: string;
}
```

### DataRecovery Component

**Purpose**: Extract data from disabled/backup files

**Interface**:
```typescript
interface RecoveryResult {
  sourceFile: string;
  targetFile: string;
  dataExtracted: string;
  recoverySuccess: boolean;
  validationPassed: boolean;
}
```

### AutoFixer Component

**Purpose**: Apply automated corrections to common errors

**Interface**:
```typescript
interface FixResult {
  filePath: string;
  fixesApplied: string[];
  fixSuccess: boolean;
  validationPassed: boolean;
  remainingErrors?: string[];
}
```

### Disabler Component

**Purpose**: Safely disable unfixable files

**Interface**:
```typescript
interface DisableResult {
  originalPath: string;
  disabledPath: string;
  importsUpdated: number;
  disableSuccess: boolean;
}
```

## Data Models

### CorruptionManifest

```typescript
interface CorruptionManifest {
  scanDate: Date;
  totalFiles: number;
  corruptedCount: number;
  byType: {
    syntax: number;
    import: number;
    type: number;
    encoding: number;
    unknown: number;
  };
  byCategory: {
    core: number;
    experimental: number;
    test: number;
    phaseSpecific: number;
  };
  files: CategorizedFile[];
}
```

### CleanupReport

```typescript
interface CleanupReport {
  startTime: Date;
  endTime: Date;
  filesProcessed: number;
  filesFixed: number;
  filesDisabled: number;
  filesRemoved: number;
  dataRecovered: number;
  buildSuccess: boolean;
  remainingErrors: string[];
  changes: ChangeLog[];
}

interface ChangeLog {
  filePath: string;
  action: 'fixed' | 'disabled' | 'removed' | 'recovered';
  details: string;
  timestamp: Date;
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: No Broken Imports After Cleanup

*For any* file that is disabled or removed, all references to it from other files SHALL be updated or removed to prevent import errors.

**Validates: Requirements 5.3**

### Property 2: Disabled Files Are Inaccessible

*For any* file renamed with `.disabled` suffix, the SvelteKit router SHALL not attempt to load it as an active route.

**Validates: Requirements 5.1**

### Property 3: Data Recovery Preserves Functionality

*For any* data recovered from a backup file, the restored code SHALL pass TypeScript compilation and contain no syntax errors.

**Validates: Requirements 3.3, 3.4**

### Property 4: Automated Fixes Maintain Semantics

*For any* file that receives automated fixes, the corrected code SHALL be semantically equivalent to the original intent (fixing syntax without changing logic).

**Validates: Requirements 4.2, 4.3**

### Property 5: Build Succeeds After Cleanup

*After* all cleanup operations complete, running `npm run build` SHALL succeed without esbuild errors related to corrupted API files.

**Validates: Requirements 6.1, 6.2**

### Property 6: Manifest Completeness

*For any* corrupted file in the API directory, it SHALL appear in the cleanup manifest with categorization and remediation approach.

**Validates: Requirements 1.3, 1.4**

## Error Handling

- **Scan Failures**: If a file cannot be read, log the error and continue scanning
- **Fix Failures**: If automated fixes fail validation, mark file for manual review
- **Import Update Failures**: If updating imports fails, log affected files and continue
- **Build Failures**: Capture esbuild output and categorize remaining errors
- **Recovery Failures**: If data recovery fails, disable the target file and document the issue

## Testing Strategy

### Unit Tests

- Test scanner identifies corrupted files correctly
- Test categorizer classifies files by type and importance
- Test data recovery extracts and validates backup data
- Test auto-fixer applies corrections without breaking code
- Test disabler safely renames files and updates imports
- Test build validator captures and categorizes errors

### Property-Based Tests

- **Property 1**: For any disabled file, verify no active routes import from it
- **Property 2**: For any recovered data, verify it passes TypeScript compilation
- **Property 3**: For any fixed file, verify build succeeds for that file
- **Property 4**: For any cleanup operation, verify manifest is complete and accurate
- **Property 5**: For any import update, verify the updated import path is valid
- **Property 6**: For any file categorization, verify category matches directory structure

### Integration Tests

- Run full cleanup pipeline on test directory with corrupted files
- Verify build succeeds after cleanup
- Verify all changes are documented in reports
- Verify disabled files are not accessible via router

