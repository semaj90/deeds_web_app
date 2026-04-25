# YoRHa Detective Interface - API Documentation

## Overview

The YoRHa Detective Interface is a comprehensive case management and evidence analysis system built with SvelteKit, Drizzle ORM, and XState. This document provides complete API reference and usage guidelines.

## Base URL

```
/api/yorha
```

## Authentication

All endpoints require Lucia v3 authentication. Session validation is handled automatically via middleware.

```typescript
// Session is available in locals
if (!locals.user) {
  return json({ error: 'Unauthorized' }, { status: 401 });
}
```

## API Endpoints

### Cases Management

#### GET /api/yorha/cases
Fetch cases with optional filtering.

**Query Parameters:**
- `limit` (number, default: 10) - Results per page
- `offset` (number, default: 0) - Pagination offset
- `status` (string, optional) - Filter by status (active, closed, archived)
- `priority` (string, optional) - Filter by priority (low, medium, high, critical)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "case_number": "CASE-2025-001",
      "title": "Case Title",
      "description": "Case description",
      "status": "active",
      "priority": "high",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

#### POST /api/yorha/cases
Create a new case.

**Request Body:**
```json
{
  "case_number": "CASE-2025-001",
  "title": "Case Title",
  "description": "Case description",
  "status": "active",
  "priority": "high",
  "case_type": "criminal",
  "jurisdiction": "State Court"
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": { /* case object */ },
  "message": "Case created successfully"
}
```

#### PUT /api/yorha/cases/:id
Update an existing case.

**Request Body:**
```json
{
  "title": "Updated Title",
  "status": "closed",
  "priority": "critical"
}
```

#### DELETE /api/yorha/cases/:id
Soft delete a case (archives it).

---

### System Metrics

#### GET /api/yorha/cluster-health
Get real-time system metrics.

**Response:**
```json
{
  "timestamp": "2025-01-01T00:00:00Z",
  "metrics": {
    "cpu_usage": 45,
    "cpu_cores": 8,
    "memory_usage": 60,
    "memory_total_gb": 32,
    "memory_used_gb": 19,
    "gpu_usage": 0,
    "gpu_memory_usage": 0,
    "gpu_temperature": 0,
    "disk_usage": 50,
    "disk_total_gb": 500,
    "disk_used_gb": 250,
    "network_latency_ms": 5,
    "network_bandwidth_mbps": 100,
    "system_health": "healthy",
    "active_cases": 5,
    "active_sessions": 3
  },
  "thresholds": {
    "cpu_warning": 80,
    "cpu_critical": 95,
    "memory_warning": 85,
    "memory_critical": 95,
    "gpu_warning": 80,
    "gpu_critical": 95
  }
}
```

#### POST /api/yorha/cluster-health
Record system metrics to database.

**Request Body:**
```json
{
  "cpu_usage": 45,
  "memory_usage": 60,
  "gpu_usage": 0,
  "system_health": "healthy",
  "active_cases": 5,
  "active_sessions": 3
}
```

---

### Evidence Management

#### GET /api/yorha/evidence/nodes
Fetch evidence nodes for a case.

**Query Parameters:**
- `case_id` (string, required) - Case ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "case_id": "uuid",
      "title": "Document Evidence",
      "evidence_type": "document",
      "position_x": 100,
      "position_y": 100,
      "color": "blue",
      "relevance_score": 85,
      "status": "active",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/yorha/evidence/nodes
Create a new evidence node.

**Request Body:**
```json
{
  "case_id": "uuid",
  "title": "Document Evidence",
  "evidence_type": "document",
  "description": "Important document",
  "position_x": 100,
  "position_y": 100,
  "color": "blue",
  "relevance_score": 85
}
```

#### PATCH /api/yorha/evidence/nodes/:id
Update evidence node position or metadata.

**Request Body:**
```json
{
  "position_x": 150,
  "position_y": 200,
  "relevance_score": 90
}
```

#### DELETE /api/yorha/evidence/nodes/:id
Archive an evidence node.

---

#### GET /api/yorha/evidence/connections
Fetch connections between evidence nodes.

**Query Parameters:**
- `case_id` (string, required) - Case ID

#### POST /api/yorha/evidence/connections
Create a connection between two evidence nodes.

**Request Body:**
```json
{
  "case_id": "uuid",
  "source_node_id": "uuid",
  "target_node_id": "uuid",
  "connection_type": "supports",
  "strength": 75,
  "description": "Document supports photo evidence"
}
```

#### PATCH /api/yorha/evidence/connections/:id
Update connection metadata.

**Request Body:**
```json
{
  "strength": 85,
  "confidence_score": 90
}
```

#### DELETE /api/yorha/evidence/connections/:id
Delete a connection.

---

### Chat System

#### GET /api/yorha/chat/sessions
Fetch chat sessions for a case.

**Query Parameters:**
- `case_id` (string, required) - Case ID

#### POST /api/yorha/chat/sessions
Create a new chat session.

**Request Body:**
```json
{
  "case_id": "uuid",
  "title": "Case Analysis",
  "context_type": "case",
  "context_id": "uuid"
}
```

---

#### GET /api/yorha/chat/messages
Fetch messages for a session.

**Query Parameters:**
- `session_id` (string, required) - Session ID

#### POST /api/yorha/chat/messages
Add a message to a session.

**Request Body:**
```json
{
  "session_id": "uuid",
  "role": "user",
  "content": "Analyze the evidence",
  "message_type": "text",
  "referenced_evidence": ["uuid1", "uuid2"]
}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "status": 400
}
```

**Common Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Server Error

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- 100 requests per minute per user
- 1000 requests per hour per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

---

## Database Schema

### Tables

**yorha_cases**
- id (UUID, PK)
- case_number (VARCHAR, UNIQUE)
- title (VARCHAR)
- description (TEXT)
- status (VARCHAR)
- priority (VARCHAR)
- created_by (UUID, FK)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**yorha_evidence_nodes**
- id (UUID, PK)
- case_id (UUID, FK)
- title (VARCHAR)
- evidence_type (VARCHAR)
- position_x (INTEGER)
- position_y (INTEGER)
- relevance_score (INTEGER)
- created_by (UUID, FK)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**yorha_evidence_connections**
- id (UUID, PK)
- case_id (UUID, FK)
- source_node_id (UUID, FK)
- target_node_id (UUID, FK)
- connection_type (VARCHAR)
- strength (INTEGER)
- created_by (UUID, FK)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**yorha_chat_sessions**
- id (UUID, PK)
- case_id (UUID, FK)
- user_id (UUID, FK)
- title (VARCHAR)
- status (VARCHAR)
- message_count (INTEGER)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**yorha_chat_messages**
- id (UUID, PK)
- session_id (UUID, FK)
- role (VARCHAR)
- content (TEXT)
- message_type (VARCHAR)
- referenced_evidence (JSONB)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**yorha_system_metrics**
- id (SERIAL, PK)
- cpu_usage (INTEGER)
- memory_usage (INTEGER)
- gpu_usage (INTEGER)
- system_health (VARCHAR)
- active_cases (INTEGER)
- recorded_at (TIMESTAMP)

---

## Examples

### Create a Case and Add Evidence

```typescript
// 1. Create case
const caseRes = await fetch('/api/yorha/cases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    case_number: 'CASE-2025-001',
    title: 'Investigation Case',
    priority: 'high'
  })
});
const caseData = await caseRes.json();
const caseId = caseData.data.id;

// 2. Add evidence node
const nodeRes = await fetch('/api/yorha/evidence/nodes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    case_id: caseId,
    title: 'Key Document',
    evidence_type: 'document',
    position_x: 100,
    position_y: 100
  })
});
const nodeData = await nodeRes.json();
const nodeId = nodeData.data.id;

// 3. Create chat session
const sessionRes = await fetch('/api/yorha/chat/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    case_id: caseId,
    title: 'Case Analysis'
  })
});
const sessionData = await sessionRes.json();
const sessionId = sessionData.data.id;

// 4. Add message
await fetch('/api/yorha/chat/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: sessionId,
    role: 'user',
    content: 'Analyze this evidence',
    referenced_evidence: [nodeId]
  })
});
```

---

## Performance Targets

- Case retrieval: < 500ms
- Evidence node creation: < 300ms
- Evidence query: < 200ms
- Chat message creation: < 200ms
- Bulk operations (100 items): < 5s

---

## Support

For issues or questions, contact the development team or refer to the GitHub repository.
