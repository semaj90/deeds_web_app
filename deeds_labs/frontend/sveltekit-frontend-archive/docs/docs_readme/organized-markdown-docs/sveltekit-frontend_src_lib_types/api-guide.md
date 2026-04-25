# API Type Centralization Guide

This document explains how to use the centralized API type definitions to ensure consistency across all SvelteKit API endpoints.

## Overview

All API types are centralized in `$lib/types/api.ts` to ensure:
- **Type Safety**: Consistent request/response interfaces
- **Maintainability**: Single source of truth for API contracts
- **Developer Experience**: IntelliSense and auto-completion
- **Error Prevention**: Compile-time type checking

## Quick Start

### 1. Import Centralized Types

```typescript
// ✅ Good: Use centralized types
import type { 
  ChatRequest, 
  ChatResponse,
  Case,
  UpdateCaseRequest,
  ApiResponse 
} from '$lib/types/api.js';

// ❌ Bad: Define inline types
export interface ChatRequest {
  message: string;
  // ... duplicate definition
}
```

### 2. Use Standardized Response Handlers

```typescript
import { apiSuccess, apiError, getRequestId, withErrorHandling } from '$lib/server/api/standard-response';

// ✅ Good: Standardized error handling
export const GET: RequestHandler = withErrorHandling(async (event) => {
  const requestId = getRequestId(event);
  
  // Your logic here
  
  return apiSuccess(data, 'Success message', requestId);
});

// ❌ Bad: Manual error handling
export const GET: RequestHandler = async ({ request }) => {
  try {
    // logic
    return json(data);
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};
```

## Available Type Categories

### Core Response Types
- `ApiResponse<T>` - Standard success response wrapper
- `ApiError` - Error response format
- `HealthStatus` - Service health check responses

### AI & Chat Types
- `ChatRequest` / `ChatResponse` - Chat API contracts
- `AIAnalysisRequest` / `AIAnalysisResponse` - AI analysis endpoints
- `VectorSearchRequest` / `VectorSearchResponse` - Vector search operations
- `RAGRequest` / `RAGResponse` - RAG system interfaces

### Case Management Types
- `Case` - Complete case entity
- `CreateCaseRequest` / `UpdateCaseRequest` - Case CRUD operations
- `CasesListResponse` - Paginated case listings

### Document & Evidence Types
- `Document` / `Evidence` - Core entity types
- `DocumentUploadRequest` / `DocumentUploadResponse` - File upload flows
- `DocumentSearchRequest` / `DocumentSearchResponse` - Search operations

### System & Admin Types
- `ClusterStatus` - Service cluster monitoring
- `SystemHealthResponse` - Overall system health
- `ServiceDiscoveryResponse` - Service registry information

## Migration Examples

### Before (Inconsistent)
```typescript
// api/chat/+server.ts
export interface ChatRequest {
  message: string;
  model?: string;
}

// api/ai/analyze/+server.ts  
interface AnalysisRequest {
  content: string;
  type: string;
}
```

### After (Centralized)
```typescript
// Both endpoints use centralized types
import type { ChatRequest, AIAnalysisRequest } from '$lib/types/api.js';
```

## Best Practices

### 1. Always Use Centralized Types
- Import from `$lib/types/api.ts`
- Never define inline request/response interfaces
- Use generic `ApiResponse<T>` wrapper

### 2. Consistent Error Handling
```typescript
export const POST: RequestHandler = withErrorHandling(async (event) => {
  const requestId = getRequestId(event);
  
  // Validation
  if (!data.field) {
    return apiError("Field is required", 400, 'VALIDATION_ERROR', undefined, requestId);
  }
  
  // Success
  return apiSuccess(result, 'Operation completed', requestId);
});
```

### 3. Type Safety Throughout
```typescript
// ✅ Strongly typed
const chatRequest: ChatRequest = await request.json();
const response: ChatResponse = {
  response: aiOutput,
  model: 'gemma3-legal',
  timestamp: new Date().toISOString(),
  performance: { /* ... */ }
};

// ❌ Untyped
const data = await request.json(); // any type
```

### 4. Request Context & Correlation
```typescript
export const POST: RequestHandler = withErrorHandling(async (event) => {
  const requestId = getRequestId(event); // Automatic correlation ID
  
  // Pass requestId through the call chain
  const result = await processRequest(data, requestId);
  
  return apiSuccess(result, undefined, requestId);
});
```

## Implementation Checklist

When refactoring an API endpoint:

- [ ] Import centralized types from `$lib/types/api.ts`
- [ ] Remove inline type definitions
- [ ] Use `withErrorHandling` wrapper
- [ ] Add request correlation with `getRequestId`
- [ ] Use `apiSuccess` / `apiError` for responses
- [ ] Add proper TypeScript types for all parameters
- [ ] Update any frontend code using the endpoint

## Type Evolution

When adding new API functionality:

1. **Add Types**: Define new types in `$lib/types/api.ts`
2. **Follow Patterns**: Use existing naming conventions
3. **Document**: Add JSDoc comments for complex types
4. **Export**: Ensure proper TypeScript exports
5. **Test**: Verify type safety in consuming code

## Common Patterns

### Paginated Responses
```typescript
import type { PaginatedResponse } from '$lib/types/api.js';

const response: PaginatedResponse<Case> = {
  data: cases,
  pagination: {
    page: 1,
    limit: 20,
    total: 100,
    totalPages: 5,
    hasNext: true,
    hasPrev: false
  }
};
```

### Search Operations
```typescript
import type { SearchRequest, SearchResponse } from '$lib/types/api.js';

export const POST: RequestHandler = withErrorHandling(async (event) => {
  const requestId = getRequestId(event);
  const searchRequest: SearchRequest = await event.request.json();
  
  const results = await performSearch(searchRequest);
  
  return apiSuccess(results, 'Search completed', requestId);
});
```

## Frontend Integration

### SvelteKit Load Functions
```typescript
// src/routes/cases/[id]/+page.server.ts
export const load: PageServerLoad = async ({ params, fetch }) => {
  const response = await fetch(`/api/cases/${params.id}`);
  const apiResponse: ApiResponse<Case> = await response.json();
  
  if (!apiResponse.success) {
    throw error(404, apiResponse.error);
  }
  
  return {
    case: apiResponse.data
  };
};
```

### Component Usage
```typescript
// Component.svelte
<script lang="ts">
  import type { Case } from '$lib/types/api.js';
  
  let { case: caseData }: { case: Case } = $props();
</script>
```

This centralization ensures type safety and consistency across the entire application stack.