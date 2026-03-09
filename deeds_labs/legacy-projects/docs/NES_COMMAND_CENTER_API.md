# NES Command Center API Reference

## Overview

The NES Command Center provides a comprehensive API for managing route metadata, error clusters, health events, and interaction logging. All endpoints follow RESTful conventions and return JSON responses.

**Base URL:** `/api/routes`

---

## Authentication

All endpoints require authentication via session cookie. Unauthenticated requests return `401 Unauthorized`.

---

## Endpoints

### Route Metadata

#### POST /api/routes/metadata
Create or update route metadata.

**Request Body:**
```json
{
  "route_id": "string (required)",
  "path": "string (required)",
  "kind": "page | api | layout | component",
  "group": "string",
  "priority": "critical | high | medium | low",
  "badges": ["string"]
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "route_id": "string",
  "path": "string",
  "kind": "string",
  "group": "string",
  "priority": "string",
  "badges": ["string"],
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Errors:**
- `400 Bad Request` - Invalid or missing required fields

---

#### GET /api/routes/:routeId/metadata
Get enriched route metadata with health status.

**Response:** `200 OK`
```json
{
  "route_id": "string",
  "path": "string",
  "kind": "string",
  "group": "string",
  "priority": "string",
  "badges": ["string"],
  "status": "healthy | flaky | broken",
  "error_count": 0,
  "suggestion_count": 0,
  "last_error_at": "ISO8601 | null",
  "last_error_message": "string | null"
}
```

**Errors:**
- `404 Not Found` - Route not found

---

### Error Clusters

#### POST /api/routes/:routeId/errors
Create a new error cluster for a route.

**Request Body:**
```json
{
  "tool": "typescript | svelte-check | eslint | vitest",
  "code": "string (e.g., TS2345)",
  "message": "string",
  "severity": "error | warning | info",
  "file_path": "string",
  "raw_log_snippet": "string (optional)"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "route_id": "string",
  "tool": "string",
  "code": "string",
  "message": "string",
  "severity": "string",
  "file_path": "string",
  "count": 1,
  "first_seen_at": "ISO8601",
  "last_seen_at": "ISO8601",
  "resolved_at": null
}
```

**Side Effects:**
- Creates `route_health_event` if status changes
- Broadcasts SSE health change event

**Errors:**
- `400 Bad Request` - Invalid fields
- `409 Conflict` - Route not found in route_metadata

---

#### GET /api/routes/:routeId/errors
List error clusters for a route with pagination.

**Query Parameters:**
- `limit` (default: 50) - Max results
- `offset` (default: 0) - Skip results
- `resolved` (optional) - Filter by resolved status (true/false)
- `archived` (optional) - Include archived errors (true/false)

**Response:** `200 OK`
```json
{
  "errors": [
    {
      "id": "uuid",
      "route_id": "string",
      "tool": "string",
      "code": "string",
      "message": "string",
      "severity": "string",
      "count": 1,
      "file_path": "string",
      "first_seen_at": "ISO8601",
      "last_seen_at": "ISO8601",
      "resolved_at": "ISO8601 | null"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "includesArchived": false
}
```

---

### Health Events

#### POST /api/routes/:routeId/health-event
Create a health status change event.

**Request Body:**
```json
{
  "old_status": "healthy | flaky | broken",
  "new_status": "healthy | flaky | broken",
  "reason": "string"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "route_id": "string",
  "old_status": "string",
  "new_status": "string",
  "reason": "string",
  "timestamp": "ISO8601"
}
```

**Side Effects:**
- Updates `route_metadata.status`
- Broadcasts SSE health change event

**Errors:**
- `409 Conflict` - Route not found

---

#### GET /api/routes/:routeId/health-history
Get health event history for a route.

**Query Parameters:**
- `limit` (default: 50)
- `offset` (default: 0)

**Response:** `200 OK`
```json
{
  "events": [
    {
      "id": "uuid",
      "route_id": "string",
      "old_status": "string",
      "new_status": "string",
      "reason": "string",
      "timestamp": "ISO8601"
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### Interaction Logging

#### POST /api/routes/:routeId/interactions
Log a user interaction with a route.

**Request Body:**
```json
{
  "interaction_type": "view | navigate | analyze | patch_apply",
  "user_id": "string (optional)",
  "metadata": {}
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "route_id": "string",
  "interaction_type": "string",
  "user_id": "string | null",
  "metadata": {},
  "timestamp": "ISO8601"
}
```

**Errors:**
- `400 Bad Request` - Invalid interaction_type
- `409 Conflict` - Route not found

---

#### GET /api/routes/:routeId/interactions
Get interaction history for a route.

**Query Parameters:**
- `limit` (default: 50)
- `offset` (default: 0)
- `archived` (optional) - Include archived interactions (true/false)

**Response:** `200 OK`
```json
{
  "interactions": [
    {
      "id": "uuid",
      "route_id": "string",
      "interaction_type": "string",
      "user_id": "string | null",
      "metadata": {},
      "timestamp": "ISO8601"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "includesArchived": false
}
```

---

### Real-Time Events (SSE)

#### GET /api/routes/events
Server-Sent Events stream for real-time updates.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Types:**

**health_change:**
```json
{
  "type": "health_change",
  "routeId": "string",
  "oldStatus": "healthy | flaky | broken",
  "newStatus": "healthy | flaky | broken",
  "reason": "string",
  "timestamp": "ISO8601"
}
```

**error_cluster:**
```json
{
  "type": "error_cluster",
  "routeId": "string",
  "errorCount": 5,
  "severity": "error",
  "timestamp": "ISO8601"
}
```

**heartbeat:** (every 30 seconds)
```json
{
  "type": "heartbeat",
  "timestamp": "ISO8601"
}
```

---

### Error Brain Analysis

#### POST /api/routes/:routeId/error-brain-analysis
Save error brain analysis results.

**Request Body:**
```json
{
  "error_cluster_id": "uuid",
  "suggestions": [
    {
      "title": "string",
      "description": "string",
      "code_snippet": "string (optional)"
    }
  ],
  "selected_suggestion_index": 0,
  "phase": "analysis | patch | verification"
}
```

**Response:** `201 Created`

---

#### POST /api/routes/:routeId/error-brain-patch
Save applied patch from error brain.

**Request Body:**
```json
{
  "analysis_id": "uuid",
  "patch_content": "string",
  "applied_timestamp": "ISO8601"
}
```

**Response:** `201 Created`

---

#### PUT /api/routes/:routeId/error-brain-patch/:patchId
Update patch verification status.

**Request Body:**
```json
{
  "verification_status": "pending | passed | failed",
  "verification_message": "string (optional)"
}
```

**Response:** `200 OK`

---

## Error Responses

All errors follow this format:
```json
{
  "message": "Human-readable error message"
}
```

**Common Status Codes:**
- `400 Bad Request` - Invalid request body or parameters
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Resource not found
- `409 Conflict` - Referential integrity violation
- `500 Internal Server Error` - Server error

---

## Rate Limiting

- 100 requests per minute per user
- SSE connections limited to 5 per user

---

## Pagination

All list endpoints support pagination:
- `limit` - Maximum results (default: 50, max: 100)
- `offset` - Skip results (default: 0)

Response includes:
```json
{
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```
