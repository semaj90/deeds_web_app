# Requirements Document

## Introduction

This spec addresses the remaining 3,071 TypeScript syntax errors in the SvelteKit frontend codebase. These errors stem from systematic corruption where commas were replaced with colons in specific contexts during previous automated transformations. The codebase has already been reduced from 70,232 errors to 3,071 (95.6% reduction), and this spec targets the final cleanup to achieve 0 errors.

## Glossary

- **Syntax_Fixer**: The automated repair system that identifies and corrects TypeScript syntax corruption patterns
- **Import_Type_Syntax**: TypeScript import statements using the `type` keyword to import type-only declarations
- **Function_Parameter_Syntax**: The comma-separated list of parameters in function declarations
- **Function_Call_Syntax**: The comma-separated list of arguments passed to function invocations
- **Object_Literal_Syntax**: JavaScript/TypeScript object notation using key-value pairs with colons
- **Nullish_Coalescing**: The `??` operator that returns the right operand when the left is null/undefined
- **TypeScript_Compiler**: The `tsc` command that validates TypeScript syntax and types
- **Svelte_Check**: The `svelte-check` command that validates Svelte component syntax

## Requirements

### Requirement 1: Import Type Syntax Repair

**User Story:** As a developer, I want corrupted import type statements fixed, so that TypeScript can correctly parse type imports.

#### Acceptance Criteria

1. WHEN an import statement contains `type,` followed by an identifier (e.g., `import { type, AuditLogEntry }`) THEN the Syntax_Fixer SHALL transform it to proper import type syntax (`import { type AuditLogEntry }`)
2. WHEN multiple type imports exist in a single import statement THEN the Syntax_Fixer SHALL fix each occurrence while preserving non-type imports
3. WHEN the import type syntax is already correct THEN the Syntax_Fixer SHALL leave it unchanged
4. IF an import statement cannot be parsed THEN the Syntax_Fixer SHALL log the error and continue processing other files

### Requirement 2: Function Parameter Syntax Repair

**User Story:** As a developer, I want corrupted function parameter lists fixed, so that function signatures are syntactically valid.

#### Acceptance Criteria

1. WHEN a function parameter list contains colons where commas should be (e.g., `resourceId: string: Record<string, unknown>`) THEN the Syntax_Fixer SHALL replace the erroneous colons with commas and proper parameter names
2. WHEN a parameter has a type annotation followed by another colon THEN the Syntax_Fixer SHALL identify the boundary between type annotation and next parameter
3. WHEN async function parameters are corrupted THEN the Syntax_Fixer SHALL apply the same repair logic
4. IF a function signature is ambiguous THEN the Syntax_Fixer SHALL preserve the original and log for manual review

### Requirement 3: Function Call Argument Syntax Repair

**User Story:** As a developer, I want corrupted function call arguments fixed, so that function invocations are syntactically valid.

#### Acceptance Criteria

1. WHEN a function call contains colons between arguments (e.g., `eq(auditLog.resourceType: filter.resourceType)`) THEN the Syntax_Fixer SHALL replace the colons with commas
2. WHEN nested function calls have corrupted syntax THEN the Syntax_Fixer SHALL repair each level of nesting
3. WHEN method chaining includes corrupted calls THEN the Syntax_Fixer SHALL repair each call in the chain
4. IF a function call spans multiple lines THEN the Syntax_Fixer SHALL handle the multi-line format correctly

### Requirement 4: Object Literal Return Type Syntax Repair

**User Story:** As a developer, I want corrupted object literal type annotations fixed, so that return types and variable declarations are valid.

#### Acceptance Criteria

1. WHEN an object literal in a return type uses commas instead of colons for property types (e.g., `document, CaseChunkDocument`) THEN the Syntax_Fixer SHALL transform it to proper type syntax (`document: CaseChunkDocument`)
2. WHEN a type annotation contains mixed correct and incorrect syntax THEN the Syntax_Fixer SHALL fix only the incorrect portions
3. WHEN generic type parameters are involved THEN the Syntax_Fixer SHALL preserve the generic syntax while fixing property types
4. IF the object literal type is complex with nested types THEN the Syntax_Fixer SHALL handle each nesting level

### Requirement 5: Nullish Coalescing Operator Repair

**User Story:** As a developer, I want corrupted nullish coalescing operators fixed, so that null-safety expressions work correctly.

#### Acceptance Criteria

1. WHEN a nullish coalescing operator is corrupted (e.g., `??` rendered incorrectly) THEN the Syntax_Fixer SHALL restore the proper `??` syntax
2. WHEN the operator appears in environment variable access patterns THEN the Syntax_Fixer SHALL preserve the surrounding context
3. WHEN chained nullish coalescing is used THEN the Syntax_Fixer SHALL repair each operator in the chain

### Requirement 6: Batch Processing and Validation

**User Story:** As a developer, I want all fixes applied systematically with validation, so that I can trust the repairs don't introduce new errors.

#### Acceptance Criteria

1. WHEN the Syntax_Fixer processes a file THEN it SHALL create a backup before modification
2. WHEN fixes are applied THEN the Syntax_Fixer SHALL run TypeScript_Compiler validation on the modified file
3. WHEN validation fails after fixes THEN the Syntax_Fixer SHALL restore from backup and log the failure
4. WHEN all files are processed THEN the Syntax_Fixer SHALL generate a summary report with before/after error counts
5. THE Syntax_Fixer SHALL process files in order of error count (highest first) to maximize early impact

### Requirement 7: Zero Error Target

**User Story:** As a developer, I want the codebase to have zero TypeScript errors, so that the build succeeds and development can proceed normally.

#### Acceptance Criteria

1. WHEN all syntax repairs are complete THEN running `npx tsc --noEmit` SHALL return 0 errors
2. WHEN all syntax repairs are complete THEN running `npx svelte-check` SHALL pass without syntax errors
3. WHEN fixes are complete THEN the Syntax_Fixer SHALL NOT have introduced any new errors
4. IF errors remain after automated fixes THEN the Syntax_Fixer SHALL categorize them for manual review
