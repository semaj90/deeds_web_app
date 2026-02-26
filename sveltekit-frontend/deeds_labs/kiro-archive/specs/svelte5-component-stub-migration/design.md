# Svelte 5 Component Stub Migration - Design

## Overview

This system provides automated detection and migration of corrupt component stubs and legacy Svelte components to Svelte 5 patterns. It targets corrupt backup files, legacy component patterns, and outdated prop/slot syntax through systematic scanning, migration, validation, and rollback capabilities.

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration CLI                             │
│         (Command-line interface for migration execution)    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────▼────────────────────────────────────┐
│                  Migration Engine                             │
│  (Orchestrates scanning, migration, validation, rollback)   │
└────┬────────────┬────────────────┬────────────────┬──────────┘
     │            │                │                │
     ▼            ▼                ▼                ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐
│ Stub     │ │ Pattern  │ │ Validation   │ │ Rollback     │
│ Scanner  │ │ Migrator │ │ Service      │ │ Service      │
└────┬─────┘ └────┬─────┘ └──────┬───────┘ └──────┬───────┘
     │            │               │                │
     ▼            ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                      File System                             │
│  (Svelte components + backups + git for rollback)          │
└─────────────────────────────────────────────────────────────┘
```

### Migration Pipeline

```
1. Stub Scanning
   ├─ Find corrupt files (.any-backup, .bak, .backup, .css-bak)
   ├─ Extract metadata (path, size, date)
   ├─ Categorize by type
   └─ Detect legacy patterns

2. Pattern Detection
   ├─ Detect <svelte:component> usage
   ├─ Detect legacy <slot> patterns
   ├─ Detect export let props
   └─ Identify icon props for Snippet migration

3. Migration
   ├─ Convert icon props to Snippets
   ├─ Replace <svelte:component> with {@render}
   ├─ Convert <slot> to {@render children()}
   ├─ Migrate props to $props() syntax
   └─ Add TypeScript types

4. Validation
   ├─ Run TypeScript compiler
   ├─ Run svelte-check
   ├─ Compare error counts
   └─ Verify no new errors

5. Cleanup & Rollback (if needed)
   ├─ Remove backup files on success
   ├─ Restore original on failure
   ├─ Log all operations
   └─ Preserve git history
```

## Components and Interfaces

### 1. Stub Scanner

**Purpose**: Scan codebase and identify corrupt stubs and legacy patterns

**Interface**:
```typescript
interface StubScanner {
  scanForStubs(): Promise<StubFile[]>;
  detectPatterns(file: StubFile): LegacyPattern[];
  categorizeFile(file: StubFile): FileCategory;
}

interface StubFile {
  path: string;
  extension: string;
  size: number;
  created: Date;
  modified: Date;
  category: FileCategory;
  patterns: LegacyPattern[];
}

interface LegacyPattern {
  type: 'svelte-component' | 'slot' | 'export-let' | 'icon-prop';
  line: number;
  content: string;
  severity: 'high' | 'medium' | 'low';
}
```

### 2. Pattern Migrator

**Purpose**: Migrate legacy patterns to Svelte 5

**Interface**:
```typescript
interface PatternMigrator {
  migrateIconProps(file: string): Promise<MigrationResult>;
  migrateComponents(file: string): Promise<MigrationResult>;
  migrateSlots(file: string): Promise<MigrationResult>;
  migrateProps(file: string): Promise<MigrationResult>;
}

interface MigrationResult {
  success: boolean;
  file: string;
  before: string;
  after: string;
  changes: string[];
  errors?: string[];
}
```

### 3. Validation Service

**Purpose**: Validate migrations don't introduce errors

**Interface**:
```typescript
interface ValidationService {
  validateTypeScript(file: string): Promise<ValidationResult>;
  validateSvelte(file: string): Promise<ValidationResult>;
  compareErrorCounts(before: number, after: number): boolean;
}

interface ValidationResult {
  passed: boolean;
  errorCount: number;
  errors: string[];
}
```

### 4. Rollback Service

**Purpose**: Rollback failed migrations

**Interface**:
```typescript
interface RollbackService {
  saveBackup(file: string): Promise<void>;
  rollback(file: string): Promise<void>;
  logFailure(file: string, reason: string): Promise<void>;
}
```

## Data Models

### Stub File Model
```typescript
interface StubFile {
  id: string;
  path: string;
  extension: string;
  size: number;
  created: Date;
  modified: Date;
  category: 'component' | 'style' | 'config' | 'other';
  patterns: LegacyPattern[];
  migrated: boolean;
  migrationDate?: Date;
}
```

### Migration Model
```typescript
interface Migration {
  id: string;
  fileId: string;
  file: string;
  type: 'icon-prop' | 'component' | 'slot' | 'props';
  before: string;
  after: string;
  applied: boolean;
  validated: boolean;
  rolledBack: boolean;
  timestamp: Date;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Stub detection completeness
*For any* codebase, scanning should find all files with corrupt extensions (.any-backup, .bak, .backup, .css-bak)
**Validates: Requirements 1.1**

### Property 2: Pattern detection accuracy
*For any* component file, all legacy patterns should be detected (svelte:component, slot, export let, icon props)
**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Icon prop migration correctness
*For any* icon prop, migrating to Snippet should preserve rendering behavior
**Validates: Requirements 3.1, 3.2**

### Property 4: Component rendering migration
*For any* svelte:component usage, replacing with {@render} should maintain functionality
**Validates: Requirements 3.2**

### Property 5: Slot migration correctness
*For any* legacy slot, converting to {@render children()} should preserve slot behavior
**Validates: Requirements 3.3**

### Property 6: Props migration type safety
*For any* export let prop, migrating to $props() should maintain type safety
**Validates: Requirements 4.1, 4.2**

### Property 7: Migration validation completeness
*For any* migration, TypeScript and svelte-check validation should always execute
**Validates: Requirements 5.1, 5.2**

### Property 8: Error count non-increase
*For any* migration, error count should never increase after validation
**Validates: Requirements 5.3**

### Property 9: Backup restoration correctness
*For any* failed migration, rollback should restore original file exactly
**Validates: Requirements 6.2**

### Property 10: Success rate accuracy
*For any* set of migrations, success rate should equal (successful migrations / total migrations)
**Validates: Requirements 7.2**

## Error Handling

### Migration Failures
- Automatic rollback to original file state
- Log failure reason with error details
- Continue to next file in queue
- Track failed migrations for manual review

### File System Errors
- Verify file exists before migrating
- Check write permissions
- Handle concurrent modifications
- Backup files before changes

### Git Integration
- Preserve git history during rollback
- Use git stash for temporary backups
- Avoid modifying .git directory
- Support both staged and unstaged changes

## Testing Strategy

### Unit Tests
- Stub detection logic
- Pattern detection functions
- Migration transformation functions
- Validation comparison logic
- Rollback file restoration
- Success rate calculation

### Property-Based Tests
- Property 1: Stub detection completeness (100 iterations)
- Property 2: Pattern detection accuracy (100 iterations)
- Property 3: Icon prop migration (100 iterations)
- Property 4: Component rendering migration (100 iterations)
- Property 5: Slot migration (100 iterations)
- Property 6: Props migration type safety (100 iterations)
- Property 7: Validation execution (100 iterations)
- Property 8: Error count non-increase (100 iterations)
- Property 9: Backup restoration (100 iterations)
- Property 10: Success rate accuracy (100 iterations)

### Integration Tests
- End-to-end migration pipeline
- Multi-file stub migration
- Validation and rollback flow
- Progress tracking accuracy

## Performance Targets

| Metric | Target |
|--------|--------|
| Stub Scanning | <5s |
| Pattern Detection | <1s per file |
| Migration | <2s per file |
| Validation | <5s per file |
| Rollback | <1s per file |
| Total Pipeline | <2min for 50 files |
| Success Rate | >90% |

## Implementation Notes

### Technology Stack
- TypeScript for type safety
- ts-morph for AST manipulation
- svelte-check for validation
- fast-check for property-based testing
- Node.js file system APIs

### File Processing
- Process files in priority order (high impact first)
- Batch similar migrations when possible
- Validate after each migration
- Track progress in real-time

### Error Recovery
- Always backup before changes
- Rollback on validation failure
- Log all failures for review
- Continue processing remaining files

