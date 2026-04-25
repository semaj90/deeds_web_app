# Error-Brain API Documentation

**Version**: 1.0.0
**Last Updated**: December 16, 2025
**Status**: Production Ready

## Overview

The Error-Brain API provides intelligent error analysis and fix generation for TypeScript and Svelte code. It leverages agentic LLM reasoning, semantic search, and contextual diff generation to automatically identify and fix errors in your codebase.

## Base URL

```
http://localhost:5173/api/error-brain
```

## Authentication

All endpoints require authentication via Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Error Responses

**401 Unauthorized** - Missing or invalid authentication token
```json
{
  "error": "Authentication required",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

**403 Forbidden** - Feature flag disabled or insufficient permissions
```json
{
  "error": "Error-brain feature is disabled",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

## Endpoints

### 1. Analyze Error

Analyzes a TypeScript or Svelte error and provides intelligent suggestions for fixes.

**Endpoint**: `POST /api/error-brain/analyze`

**Feature Flag**: `ERROR_BRAIN_ENABLED`

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**:
```typescript
{
  // Required: The error message to analyze
  errorMessage: string;

  // Optional: Full error stack trace
  errorStack?: string;

  // Optional: Path to the file containing the error
  filePath?: string;

  // Optional: Code context around the error (3-5 lines)
  codeContext?: string;

  // Optional: Type of error (typescript, svelte, runtime, etc.)
  errorType?: string;
}
```

**Request Example**:
```bash
curl -X POST http://localhost:5173/api/error-brain/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "errorMessage": "Type \"string\" is not assignable to type \"number\"",
    "filePath": "src/lib/components/Button.svelte",
    "errorType": "typescript",
    "codeContext": "let count: number = \"5\";\nconst increment = () => count++;\nreturn count;"
  }'
```

**Response** (200 OK):
```typescript
{
  // Unique analysis ID for reference
  id: string;

  // The error message that was analyzed
  errorMessage: string;

  // Detailed analysis results
  analysis: {
    // Categorized error type
    errorType: string;

    // Severity level: low, medium, high, critical
    severity: "low" | "medium" | "high" | "critical";

    // Root cause explanation
    rootCause: string;

    // Array of suggested fixes (ordered by confidence)
    suggestedFixes: string[];
  };

  // ISO 8601 timestamp
  timestamp: string;

  // User ID (if authenticated)
  userId?: string;
}
```

**Response Example**:
```json
{
  "id": "analysis_1702734600000_abc123def",
  "errorMessage": "Type \"string\" is not assignable to type \"number\"",
  "analysis": {
    "errorType": "typescript",
    "severity": "high",
    "rootCause": "Variable 'count' is declared as number but assigned a string value",
    "suggestedFixes": [
      "Change assignment to: let count: number = 5;",
      "Change type annotation to: let count: string = \"5\";",
      "Use type coercion: let count: number = parseInt(\"5\", 10);"
    ]
  },
  "timestamp": "2025-12-16T10:30:00Z",
  "userId": "user_123"
}
```

**Error Responses**:

**400 Bad Request** - Missing required field
```json
{
  "error": "errorMessage is required",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

**500 Internal Server Error** - Analysis failed
```json
{
  "error": "Failed to analyze error",
  "details": "LLM service unavailable",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

---

### 2. Generate Patch

Generates a code patch for a selected fix from a previous analysis.

**Endpoint**: `PATCH /api/error-brain/patch`

**Feature Flag**: `ERROR_BRAIN_ENABLED`

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**:
```typescript
{
  // Required: ID from previous analyze response
  analysisId: string;

  // Required: Index of the suggested fix to use (0-based)
  selectedFix: number;

  // Optional: Additional context for patch generation
  context?: Record<string, unknown>;
}
```

**Request Example**:
```bash
curl -X PATCH http://localhost:5173/api/error-brain/patch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "analysisId": "analysis_1702734600000_abc123def",
    "selectedFix": 0,
    "context": {
      "autoApply": false
    }
  }'
```

**Response** (200 OK):
```typescript
{
  // Unique patch ID
  id: string;

  // Reference to the analysis
  analysisId: string;

  // Patch details
  patch: {
    // File path to be modified
    filePath: string;

    // Array of changes to apply
    changes: Array<{
      // Type of change: add, remove, or modify
      type: "add" | "remove" | "modify";

      // Line number (1-based)
      line: number;

      // Content to add/modify
      content: string;
    }>;
  };

  // ISO 8601 timestamp
  timestamp: string;

  // User ID (if authenticated)
  userId?: string;
}
```

**Response Example**:
```json
{
  "id": "patch_1702734605000_xyz789",
  "analysisId": "analysis_1702734600000_abc123def",
  "patch": {
    "filePath": "src/lib/components/Button.svelte",
    "changes": [
      {
        "type": "modify",
        "line": 5,
        "content": "let count: number = 5;"
      }
    ]
  },
  "timestamp": "2025-12-16T10:30:05Z",
  "userId": "user_123"
}
```

**Error Responses**:

**400 Bad Request** - Missing required fields
```json
{
  "error": "analysisId and selectedFix are required",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

**404 Not Found** - Analysis not found
```json
{
  "error": "Analysis not found",
  "details": "analysisId: analysis_1702734600000_abc123def",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

**500 Internal Server Error** - Patch generation failed
```json
{
  "error": "Failed to generate patch",
  "details": "AST transformation error",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

---

### 3. Get History

Retrieves the error analysis and patch history for the current user.

**Endpoint**: `GET /api/error-brain/history`

**Feature Flag**: `ERROR_BRAIN_ENABLED`

**Request Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
```
limit=10      # Maximum number of entries to return (default: 10, max: 100)
offset=0      # Number of entries to skip (default: 0)
type=all      # Filter by type: all, analysis, patch, applied (default: all)
```

**Request Example**:
```bash
curl -X GET "http://localhost:5173/api/error-brain/history?limit=20&offset=0&type=analysis" \
  -H "Authorization: Bearer your-token"
```

**Response** (200 OK):
```typescript
{
  // Array of history entries
  history: Array<{
    // Unique entry ID
    id: string;

    // Type of entry: analysis, patch, or applied
    type: "analysis" | "patch" | "applied";

    // Entry data (AnalysisResult or PatchResult)
    data: AnalysisResult | PatchResult;

    // ISO 8601 timestamp
    timestamp: string;

    // User ID
    userId?: string;
  }>;

  // Total number of entries matching the filter
  total: number;

  // Pagination info
  limit: number;
  offset: number;

  // ISO 8601 timestamp
  timestamp: string;
}
```

**Response Example**:
```json
{
  "history": [
    {
      "id": "history_1",
      "type": "analysis",
      "data": {
        "id": "analysis_1702734600000_abc123def",
        "errorMessage": "Type \"string\" is not assignable to type \"number\"",
        "analysis": {
          "errorType": "typescript",
          "severity": "high",
          "rootCause": "Variable 'count' is declared as number but assigned a string value",
          "suggestedFixes": [
            "Change assignment to: let count: number = 5;"
          ]
        },
        "timestamp": "2025-12-16T10:30:00Z",
        "userId": "user_123"
      },
      "timestamp": "2025-12-16T10:30:00Z",
      "userId": "user_123"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "timestamp": "2025-12-16T10:30:10Z"
}
```

**Error Responses**:

**400 Bad Request** - Invalid query parameters
```json
{
  "error": "Invalid limit parameter",
  "details": "limit must be between 1 and 100",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

**500 Internal Server Error** - History retrieval failed
```json
{
  "error": "Failed to get history",
  "details": "Database connection error",
  "timestamp": "2025-12-16T10:30:00Z"
}
```

---

## Data Types

### AnalysisResult

```typescript
interface AnalysisResult {
  id: string;
  errorMessage: string;
  analysis: {
    errorType: string;
    severity: "low" | "medium" | "high" | "critical";
    rootCause: string;
    suggestedFixes: string[];
  };
  timestamp: string;
  userId?: string;
}
```

### PatchResult

```typescript
interface PatchResult {
  id: string;
  analysisId: string;
  patch: {
    filePath: string;
    changes: Array<{
      type: "add" | "remove" | "modify";
      line: number;
      content: string;
    }>;
  };
  timestamp: string;
  userId?: string;
}
```

### HistoryEntry

```typescript
interface HistoryEntry {
  id: string;
  type: "analysis" | "patch" | "applied";
  data: AnalysisResult | PatchResult;
  timestamp: string;
  userId?: string;
}
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid request parameters or missing required fields |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Feature flag disabled or insufficient permissions |
| 404 | Not Found | Resource not found (analysis, patch, etc.) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error during processing |
| 503 | Service Unavailable | LLM or other service unavailable |

---

## Rate Limiting

The Error-Brain API implements rate limiting to prevent abuse:

- **Analyze**: 100 requests per hour per user
- **Patch**: 50 requests per hour per user
- **History**: 1000 requests per hour per user

Rate limit information is included in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1702738200
```

---

## Feature Flags

The Error-Brain API is controlled by feature flags:

| Flag | Default | Description |
|------|---------|-------------|
| `ERROR_BRAIN_ENABLED` | false | Enable/disable all error-brain endpoints |
| `ERROR_BRAIN_ANALYZE` | false | Enable error analysis |
| `ERROR_BRAIN_PATCH` | false | Enable patch generation |
| `ERROR_BRAIN_HISTORY` | false | Enable history retrieval |

When a feature is disabled, endpoints return 403 Forbidden.

---

## Usage Examples

### Example 1: Analyze and Fix a Type Error

```bash
# Step 1: Analyze the error
ANALYSIS=$(curl -s -X POST http://localhost:5173/api/error-brain/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d '{
    "errorMessage": "Type \"string\" is not assignable to type \"number\"",
    "filePath": "src/lib/Button.svelte",
    "errorType": "typescript"
  }')

ANALYSIS_ID=$(echo $ANALYSIS | jq -r '.id')

# Step 2: Generate a patch for the first suggested fix
PATCH=$(curl -s -X PATCH http://localhost:5173/api/error-brain/patch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d "{
    \"analysisId\": \"$ANALYSIS_ID\",
    \"selectedFix\": 0
  }")

echo $PATCH | jq '.patch.changes'
```

### Example 2: Get Recent Analyses

```bash
curl -s -X GET "http://localhost:5173/api/error-brain/history?limit=10&type=analysis" \
  -H "Authorization: Bearer token" | jq '.history[] | {id, type, timestamp}'
```

### Example 3: Batch Error Analysis

```bash
# Analyze multiple errors
for error in "Type error" "Missing import" "Invalid prop"; do
  curl -s -X POST http://localhost:5173/api/error-brain/analyze \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer token" \
    -d "{\"errorMessage\": \"$error\"}" | jq '.id'
done
```

---

## Best Practices

### 1. Error Context

Always provide as much context as possible for better analysis:

```json
{
  "errorMessage": "Type error",
  "filePath": "src/lib/Button.svelte",
  "errorType": "typescript",
  "codeContext": "let count: number = \"5\";\nconst increment = () => count++;"
}
```

### 2. Batch Processing

For multiple errors, use pagination to avoid rate limits:

```bash
# Process errors in batches
for i in {0..100..10}; do
  curl -s -X GET "http://localhost:5173/api/error-brain/history?limit=10&offset=$i" \
    -H "Authorization: Bearer token"
done
```

### 3. Error Handling

Always handle errors gracefully:

```typescript
try {
  const response = await fetch('/api/error-brain/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ errorMessage })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error(`Error (${response.status}):`, error.error);
    return;
  }

  const result = await response.json();
  console.log('Analysis:', result);
} catch (error) {
  console.error('Network error:', error);
}
```

### 4. Caching

Cache analysis results to reduce API calls:

```typescript
const cache = new Map<string, AnalysisResult>();

async function analyzeError(errorMessage: string) {
  if (cache.has(errorMessage)) {
    return cache.get(errorMessage);
  }

  const result = await fetch('/api/error-brain/analyze', {
    method: 'POST',
    body: JSON.stringify({ errorMessage })
  }).then(r => r.json());

  cache.set(errorMessage, result);
  return result;
}
```

---

## Troubleshooting

### Issue: 403 Forbidden

**Cause**: Feature flag is disabled or user lacks permissions

**Solution**:
1. Check feature flag configuration
2. Verify user authentication and permissions
3. Contact administrator if needed

### Issue: 500 Internal Server Error

**Cause**: LLM service unavailable or processing error

**Solution**:
1. Check service health: `GET /api/health/services`
2. Retry with exponential backoff
3. Check error details in response

### Issue: Rate Limit Exceeded

**Cause**: Too many requests in short time

**Solution**:
1. Implement exponential backoff
2. Cache results when possible
3. Batch requests efficiently

---

## Support

For issues or questions:

1. Check this documentation
2. Review error responses and error codes
3. Check service health endpoints
4. Contact the development team

---

**Last Updated**: December 16, 2025
**Version**: 1.0.0
**Status**: Production Ready
