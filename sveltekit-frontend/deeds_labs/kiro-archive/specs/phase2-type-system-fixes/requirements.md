# Requirements Document: Phase 2 Type System Fixes

## Introduction

This specification addresses systematic type system errors across the YoRHa Legal AI Platform's SvelteKit frontend. Following Phase 96's successful corruption pattern fixes (8,790 fixes, 13% error reduction), Phase 2 targets the remaining ~88,500 errors which are primarily type-related rather than syntax corruption.

The system integrates modern WebGPU compute shaders, LangChain v1 agents, and TypeScript 5.x strict mode patterns for GPU-accelerated legal document analysis.

## Glossary

- **Type System**: TypeScript's compile-time type checking and inference system
- **Bits UI**: Headless component library providing accessible UI primitives
- **Null Safety**: TypeScript patterns using optional chaining (`?.`) and nullish coalescing (`??`)
- **Generic Types**: TypeScript parameterized types allowing type reuse with different type arguments
- **WebGPU**: Modern GPU API for compute shaders and graphics rendering
- **LangChain v1**: Agent framework with middleware-based architecture for LLM orchestration
- **Storage Buffer**: WebGPU buffer type for compute shader input/output with read/write access
- **Atomic Operations**: Thread-safe operations for concurrent data access in compute shaders
- **Middleware**: LangChain v1 composable functions for agent context engineering

---

## Requirements

### Requirement 1: Bits UI Import Modernization

**User Story:** As a developer, I want all Bits UI imports to use the correct v2.0 import paths, so that component type definitions resolve correctly and the UI library functions properly.

#### Acceptance Criteria

1. WHEN importing Bits UI components, THE System SHALL use the `bits-ui` package namespace
2. WHEN importing Bits UI components, THE System SHALL NOT use deprecated `@melt-ui` imports
3. WHEN importing Bits UI builders, THE System SHALL use the correct v2.0 builder API paths
4. FOR ALL Bits UI component imports, THE System SHALL include proper TypeScript type imports
5. WHEN using Bits UI components, THE System SHALL follow the headless component pattern with proper prop spreading

---

### Requirement 2: Null Safety Enhancement

**User Story:** As a developer, I want proper null safety patterns throughout the codebase, so that runtime null/undefined errors are prevented and type checking is more accurate.

#### Acceptance Criteria

1. WHEN accessing potentially undefined properties, THE System SHALL use optional chaining (`?.`)
2. WHEN providing default values for null/undefined, THE System SHALL use nullish coalescing (`??`)
3. WHEN checking for null/undefined, THE System SHALL use strict equality (`=== null`, `=== undefined`)
4. FOR ALL function parameters that may be null/undefined, THE System SHALL use union types with `null` or `undefined`
5. WHEN working with arrays that may be undefined, THE System SHALL guard access with optional chaining

---

### Requirement 3: WebGPU Type Alignment

**User Story:** As a developer, I want WebGPU compute shader interfaces to follow modern alignment patterns, so that GPU-accelerated document processing works correctly with TypeScript type safety.

#### Acceptance Criteria

1. WHEN defining WebGPU buffer types, THE System SHALL use scalar arrays (`array<f32>`) for flexible stride/offset patterns
2. WHEN working with vec3/vec4 data, THE System SHALL manually construct vectors from scalar arrays to avoid alignment issues
3. WHEN passing buffer metadata, THE System SHALL provide stride and offset values in uniform buffers
4. FOR ALL compute shader bindings, THE System SHALL use proper TypeScript types matching WGSL shader definitions
5. WHEN using atomic operations, THE System SHALL quantize floating point values to `i32` for thread-safe accumulation
6. WHEN creating storage buffers, THE System SHALL include `GPUBufferUsage.STORAGE` flag in TypeScript buffer descriptors

---

### Requirement 4: LangChain v1 Migration

**User Story:** As a developer, I want LangChain integrations to use the v1.0 API with middleware patterns, so that AI agent orchestration follows modern best practices and provides better customization.

#### Acceptance Criteria

1. WHEN creating agents, THE System SHALL use `createAgent()` instead of deprecated chain abstractions
2. WHEN implementing agent customization, THE System SHALL use middleware hooks (`beforeModel`, `wrapModelCall`, etc.)
3. WHEN handling structured output, THE System SHALL use the new content blocks API
4. FOR ALL tool calling, THE System SHALL use standardized message format with proper error handling
5. WHEN managing agent state, THE System SHALL leverage LangGraph's built-in checkpointing
6. WHEN importing LangChain functionality, THE System SHALL use `langchain` package (not `@langchain/core` directly)

---

### Requirement 5: Generic Type Fixes

**User Story:** As a developer, I want generic type parameters to be correctly specified throughout the codebase, so that type inference works properly and type errors are eliminated.

#### Acceptance Criteria

1. WHEN using generic functions, THE System SHALL provide explicit type arguments where inference fails
2. WHEN defining generic types, THE System SHALL use proper constraint syntax (`T extends SomeType`)
3. WHEN working with Promise types, THE System SHALL specify the resolved value type (`Promise<T>`)
4. FOR ALL array methods with callbacks, THE System SHALL ensure callback return types match expected types
5. WHEN using utility types, THE System SHALL provide all required type parameters

---

### Requirement 6: Type Mismatch Resolution

**User Story:** As a developer, I want type mismatches between function signatures and call sites to be resolved, so that the codebase type-checks correctly and runtime type errors are prevented.

#### Acceptance Criteria

1. WHEN calling functions, THE System SHALL provide arguments matching the function signature types
2. WHEN assigning values, THE System SHALL ensure source and target types are compatible
3. WHEN returning values from functions, THE System SHALL match the declared return type
4. FOR ALL object literals, THE System SHALL include all required properties with correct types
5. WHEN using union types, THE System SHALL narrow types appropriately before access

---

### Requirement 7: Import Type Declarations

**User Story:** As a developer, I want proper `import type` declarations for type-only imports, so that the TypeScript compiler can optimize bundle size and avoid circular dependencies.

#### Acceptance Criteria

1. WHEN importing only types, THE System SHALL use `import type` syntax
2. WHEN importing both types and values, THE System SHALL use separate import statements
3. WHEN re-exporting types, THE System SHALL use `export type` syntax
4. FOR ALL type-only imports, THE System SHALL enable `verbatimModuleSyntax` compliance
5. WHEN using types in type annotations only, THE System SHALL not import the value

---

### Requirement 8: WebGPU Compute Shader Patterns

**User Story:** As a developer, I want compute shader TypeScript interfaces to follow the scalar array pattern documented in WebGPU best practices, so that vertex data manipulation works correctly regardless of stride/offset.

#### Acceptance Criteria

1. WHEN defining vertex input buffers, THE System SHALL use `array<f32>` with manual vector reconstruction
2. WHEN passing vertex metadata, THE System SHALL provide stride in elements (not bytes) via uniforms
3. WHEN passing vertex metadata, THE System SHALL provide offset in elements (not bytes) via uniforms
4. FOR ALL vertex attribute access, THE System SHALL use helper functions that calculate `index * stride + offset`
5. WHEN outputting vertex data, THE System SHALL use properly aligned structs (vec3 with 16-byte alignment)
6. WHEN synchronizing between threads, THE System SHALL use atomic operations with quantized values

---

## Special Requirements Guidance

### WebGPU Compute Shader Requirements

**Critical Pattern**: All WebGPU compute shaders manipulating vertex data MUST follow the scalar array pattern to avoid alignment issues:

```typescript
// ✅ CORRECT: Scalar array with manual reconstruction
@group(0) @binding(0) var<storage> positions: array<f32>;

function getPosition(index: u32, stride: u32, offset: u32): vec3f {
  const i = index * stride + offset;
  return vec3f(positions[i], positions[i + 1], positions[i + 2]);
}

// ❌ INCORRECT: Direct vec3 array (alignment issues)
@group(0) @binding(0) var<storage> positions: array<vec3f>;
```

**Rationale**: WGSL requires vec3<f32> to be aligned to 16-byte boundaries, but vertex data is often tightly packed at 12-byte intervals or interleaved with other attributes.

### LangChain v1 Migration Requirements

**Critical Pattern**: All agent creation MUST use `createAgent()` with middleware:

```typescript
// ✅ CORRECT: LangChain v1 pattern
import { createAgent, summarizationMiddleware } from "langchain";

const agent = createAgent({
  model: "claude-sonnet-4-5-20250929",
  tools: [searchTool, analysisTool],
  middleware: [
    summarizationMiddleware({
      model: "claude-sonnet-4-5-20250929",
      trigger: { tokens: 500 }
    })
  ]
});

// ❌ INCORRECT: Deprecated chain pattern
import { LLMChain } from "@langchain/core/chains";
const chain = new LLMChain({ llm, prompt });
```

**Rationale**: LangChain v1 deprecates all old chain abstractions in favor of the unified `createAgent()` API with middleware for customization.

---

## Document Format

This requirements document follows EARS (Easy Approach to Requirements Syntax) patterns and INCOSE quality rules as specified in the Svelte5 Error Remediation specification framework.

All requirements are:
- ✅ Testable through automated type checking
- ✅ Traceable to specific error categories
- ✅ Measurable through error count reduction
- ✅ Implementable through automated fix scripts

**Target Impact**: ~27,000 errors eliminated (57% reduction from current 88,500)
