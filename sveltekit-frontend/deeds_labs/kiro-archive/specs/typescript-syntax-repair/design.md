# Design Document: TypeScript Syntax Repair

## Overview

This design document outlines the systematic approach to fix the remaining 3,071 TypeScript syntax errors in the SvelteKit frontend. The errors follow predictable corruption patterns where commas were replaced with colons in specific contexts. The solution uses pattern-based regex transformations with multi-pass processing to handle cascading fixes.

### Error Distribution Analysis

| Error Code | Count | Percentage | Root Cause |
|------------|-------|------------|------------|
| TS1005 | 1,879 | 61% | Comma/colon swap in various contexts |
| TS1128 | 432 | 14% | Declaration expected (cascading from TS1005) |
| TS1434 | 154 | 5% | Unknown keyword (malformed type imports) |
| TS1109 | 129 | 4% | Expression expected (cascading) |
| TS1135 | 83 | 3% | Argument expression expected |
| Other | 394 | 13% | Various cascading errors |

### Design Principles

1. **Pattern-Based Fixes**: Each corruption type has a specific regex pattern and replacement
2. **Multi-Pass Processing**: Some fixes reveal new fixable patterns, requiring multiple passes
3. **Validation-First**: Every fix is validated before committing to prevent regression
4. **Highest-Impact First**: Process files with most errors first for maximum early progress

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  TypeScript Syntax Repair                   │
│                         System                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         Pattern Matcher Engine          │
        │  (Identifies corruption patterns)       │
        └─────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│  Pass 1: Import   │                   │  Validation       │
│  Type Syntax      │                   │  Engine           │
│  - type, X → type X                   │  - tsc --noEmit   │
└───────────────────┘                   │  - svelte-check   │
        │                               └───────────────────┘
        ▼                                           ▲
┌───────────────────┐                               │
│  Pass 2: Function │                               │
│  Parameters       │───────────────────────────────┘
│  - a: T: b → a: T, b
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Pass 3: Function │
│  Call Arguments   │
│  - fn(a: b) → fn(a, b)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Pass 4: Object   │
│  Literal Types    │
│  - x, Type → x: Type
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Pass 5: Cleanup  │
│  & Validation     │
└───────────────────┘
```

## Components and Interfaces

### Component 1: Pattern Matcher Engine

```typescript
interface PatternMatcher {
  name: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  validate: (before: string, after: string) => boolean;
}

interface FixResult {
  file: string;
  pattern: string;
  matchCount: number;
  success: boolean;
  errorsBefore: number;
  errorsAfter: number;
}
```

### Component 2: File Processor

```typescript
interface FileProcessor {
  processFile(filePath: string, patterns: PatternMatcher[]): Promise<FixResult[]>;
  processDirectory(dirPath: string, patterns: PatternMatcher[]): Promise<FixResult[]>;
  createBackup(filePath: string): Promise<string>;
  restoreBackup(backupPath: string, originalPath: string): Promise<void>;
}
```

### Component 3: Validation Engine

```typescript
interface ValidationEngine {
  validateFile(filePath: string): Promise<ValidationResult>;
  validateProject(): Promise<ProjectValidationResult>;
  getErrorCount(): Promise<number>;
}

interface ValidationResult {
  file: string;
  errors: TypeScriptError[];
  isValid: boolean;
}

interface ProjectValidationResult {
  totalErrors: number;
  errorsByFile: Map<string, number>;
  errorsByCode: Map<string, number>;
}
```

## Data Models

### Fix Pattern Definitions

```typescript
// Pattern 1: Import Type Syntax
// Before: import { type, AuditLogEntry, type, NewAuditLogEntry }
// After:  import { type AuditLogEntry, type NewAuditLogEntry }
const importTypePattern: PatternMatcher = {
  name: 'import-type-syntax',
  description: 'Fix corrupted import type syntax',
  pattern: /import\s*\{([^}]*)\}/g,
  replacement: (match, imports) => {
    const fixed = imports.replace(/type,\s*([A-Z])/g, 'type $1');
    return `import {${fixed}}`;
  },
  validate: (before, after) => !after.includes('type,')
};

// Pattern 2: Function Parameter Syntax
// Before: resourceId: string: Record<string, unknown>
// After:  resourceId: string, oldValues: Record<string, unknown>
const functionParamPattern: PatternMatcher = {
  name: 'function-param-syntax',
  description: 'Fix corrupted function parameter lists',
  pattern: /(\w+):\s*(\w+(?:<[^>]+>)?)\s*:\s*(\w+(?:<[^>]+>)?)/g,
  replacement: '$1: $2, $3',
  validate: (before, after) => true
};

// Pattern 3: Function Call Arguments
// Before: eq(auditLog.resourceType: filter.resourceType)
// After:  eq(auditLog.resourceType, filter.resourceType)
const functionCallPattern: PatternMatcher = {
  name: 'function-call-syntax',
  description: 'Fix corrupted function call arguments',
  pattern: /(\w+)\(([^()]+):\s*([^()]+)\)/g,
  replacement: '$1($2, $3)',
  validate: (before, after) => true
};

// Pattern 4: Object Literal Type Syntax
// Before: document, CaseChunkDocument
// After:  document: CaseChunkDocument
const objectLiteralTypePattern: PatternMatcher = {
  name: 'object-literal-type',
  description: 'Fix corrupted object literal type annotations',
  pattern: /(\w+),\s*([A-Z]\w+)([;}\)])/g,
  replacement: '$1: $2$3',
  validate: (before, after) => true
};

// Pattern 5: Nullish Coalescing
// Before: process.env?.DATABASE_URL?? 'default'
// After:  process.env?.DATABASE_URL ?? 'default'
const nullishCoalescingPattern: PatternMatcher = {
  name: 'nullish-coalescing',
  description: 'Fix corrupted nullish coalescing operators',
  pattern: /\?\?\s*(?=['"a-zA-Z0-9])/g,
  replacement: ' ?? ',
  validate: (before, after) => true
};
```

### Processing Configuration

```typescript
interface ProcessingConfig {
  targetDirectory: string;
  fileExtensions: string[];
  maxPasses: number;
  createBackups: boolean;
  validateAfterEachFile: boolean;
  stopOnValidationFailure: boolean;
  priorityFiles: string[];
}

const defaultConfig: ProcessingConfig = {
  targetDirectory: 'sveltekit-frontend/src',
  fileExtensions: ['.ts', '.svelte'],
  maxPasses: 5,
  createBackups: true,
  validateAfterEachFile: false,
  stopOnValidationFailure: false,
  priorityFiles: [
    'elasticsearch-indexing-service.ts',
    'audit-service.ts',
    'kmeans-service.ts',
    'rag-retrieval-service.ts',
    'http-cache-headers.ts',
    'unified-client.ts',
    'citation-library.service.ts',
    'xstate-machine.ts',
    'vector-operations.ts',
    'redis-cache.ts'
  ]
};
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified for property-based testing:

### Property 1: Import Type Transformation Correctness

*For any* import statement containing the corrupted pattern `type,` followed by an identifier, applying the import type fix SHALL produce a valid TypeScript import statement where `type` is properly attached to its identifier without a comma separator.

**Validates: Requirements 1.1, 1.2**

### Property 2: Idempotence of Syntax Fixes

*For any* TypeScript file that is already syntactically correct, applying the syntax fixer SHALL produce output identical to the input (no changes made).

**Validates: Requirements 1.3**

### Property 3: Function Parameter Transformation Correctness

*For any* function signature containing corrupted parameter syntax (colons where commas should separate parameters), applying the function parameter fix SHALL produce a valid TypeScript function signature with properly comma-separated parameters.

**Validates: Requirements 2.1, 2.2**

### Property 4: Function Call Argument Transformation Correctness

*For any* function call containing corrupted argument syntax (colons between arguments), applying the function call fix SHALL produce a valid TypeScript function call with properly comma-separated arguments.

**Validates: Requirements 3.1, 3.2**

### Property 5: Object Literal Type Transformation Correctness

*For any* type annotation containing corrupted object literal syntax (commas where colons should define property types), applying the object literal type fix SHALL produce a valid TypeScript type annotation with proper colon separators.

**Validates: Requirements 4.1, 4.2**

### Property 6: Nullish Coalescing Transformation Correctness

*For any* expression containing a corrupted nullish coalescing operator, applying the nullish coalescing fix SHALL produce a valid TypeScript expression with properly spaced `??` operator.

**Validates: Requirements 5.1**

### Property 7: Backup Creation Guarantee

*For any* file processed by the Syntax_Fixer, a backup file SHALL exist before any modifications are written to the original file.

**Validates: Requirements 6.1**

### Property 8: Error Recovery from Validation Failure

*For any* file where fixes cause TypeScript validation to fail, the Syntax_Fixer SHALL restore the original file content from backup and the file SHALL be unchanged from its pre-fix state.

**Validates: Requirements 6.3**

### Property 9: No Regression Guarantee

*For any* execution of the Syntax_Fixer, the total TypeScript error count after processing SHALL be less than or equal to the error count before processing (errors never increase).

**Validates: Requirements 7.3**

## Error Handling

### Error Categories

1. **Parse Errors**: Files that cannot be read or parsed
   - Action: Log error, skip file, continue processing
   - Recovery: None needed, file unchanged

2. **Pattern Match Failures**: Regex patterns that don't match expected content
   - Action: Log warning, skip pattern, try next pattern
   - Recovery: None needed, file unchanged

3. **Validation Failures**: Fixes that introduce new TypeScript errors
   - Action: Restore from backup, log failure with details
   - Recovery: Automatic via backup restoration

4. **File System Errors**: Permission denied, disk full, etc.
   - Action: Log error, abort current file, continue with next
   - Recovery: Manual intervention required

### Error Logging Format

```typescript
interface ErrorLog {
  timestamp: string;
  file: string;
  errorType: 'parse' | 'pattern' | 'validation' | 'filesystem';
  message: string;
  context?: {
    line?: number;
    column?: number;
    pattern?: string;
    originalContent?: string;
  };
}
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** (specific examples and edge cases):
- Test each pattern with known corrupted inputs
- Test edge cases like empty files, files with no matches
- Test error handling paths
- Test backup/restore functionality

**Property-Based Tests** (universal properties):
- Use fast-check library for TypeScript property-based testing
- Minimum 100 iterations per property test
- Generate random corrupted inputs matching each pattern
- Verify transformations produce valid TypeScript

### Property-Based Testing Configuration

```typescript
import fc from 'fast-check';

// Configuration for all property tests
const propertyTestConfig = {
  numRuns: 100,
  verbose: true,
  seed: Date.now()
};

// Tag format for each test
// Feature: typescript-syntax-repair, Property N: [property description]
```

### Test File Organization

```
sveltekit-frontend/src/lib/__tests__/
├── syntax-repair/
│   ├── import-type-fix.test.ts       # Unit tests for import type pattern
│   ├── function-param-fix.test.ts    # Unit tests for function params
│   ├── function-call-fix.test.ts     # Unit tests for function calls
│   ├── object-literal-fix.test.ts    # Unit tests for object literals
│   ├── nullish-coalescing-fix.test.ts # Unit tests for ?? operator
│   ├── backup-restore.test.ts        # Unit tests for backup system
│   └── properties.test.ts            # Property-based tests (all 9 properties)
```

### Test Execution

```bash
# Run all syntax repair tests
npm run test -- --filter="syntax-repair"

# Run property tests only
npm run test -- --filter="properties"

# Run with coverage
npm run test -- --coverage --filter="syntax-repair"
```
