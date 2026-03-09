# NES Command Center Database Schema

## Overview

The NES Command Center uses PostgreSQL with Drizzle ORM for type-safe database operations. The schema supports route tracking, error clustering, health monitoring, and interaction logging.

---

## Tables

### route_metadata
Stores metadata for tracked routes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| route_id | VARCHAR(255) | UNIQUE, NOT NULL | Route identifier (e.g., "(app)/dashboard") |
| path | VARCHAR(500) | NOT NULL | URL path (e.g., "/dashboard") |
| kind | VARCHAR(50) | | Route type: page, api, layout, component |
| group | VARCHAR(100) | | Grouping category |
| priority | VARCHAR(20) | | Priority: critical, high, medium, low |
| badges | JSONB | DEFAULT '[]' | Array of badge strings |
| status | VARCHAR(20) | | Health status: healthy, flaky, broken |
| archived_at | TIMESTAMP | | Soft delete timestamp |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_route_metadata_route_id` ON (route_id)
- `idx_route_metadata_status` ON (status)
- `idx_route_metadata_group` ON (group)

---

### error_cluster
Groups related errors for a route.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| route_id | VARCHAR(255) | FK → route_metadata, NOT NULL | Associated route |
| tool | VARCHAR(50) | NOT NULL | Tool: typescript, svelte-check, eslint, vitest |
| code | VARCHAR(50) | | Error code (e.g., TS2345) |
| message | TEXT | NOT NULL | Error message |
| severity | VARCHAR(20) | NOT NULL | Severity: error, warning, info |
| count | INTEGER | DEFAULT 1 | Occurrence count |
| file_path | VARCHAR(500) | | Affected file path |
| raw_log_snippet | TEXT | | Raw log output |
| cluster_id | VARCHAR(100) | | Deduplication cluster ID |
| error_code | VARCHAR(50) | | Normalized error code |
| category | VARCHAR(100) | | Error category |
| affected_routes | JSONB | DEFAULT '[]' | Related routes |
| first_seen_at | TIMESTAMP | DEFAULT NOW() | First occurrence |
| last_seen_at | TIMESTAMP | DEFAULT NOW() | Last occurrence |
| resolved_at | TIMESTAMP | | Resolution timestamp |
| archived_at | TIMESTAMP | | Soft delete timestamp |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_error_cluster_route_id` ON (route_id)
- `idx_error_cluster_tool` ON (tool)
- `idx_error_cluster_severity` ON (severity)
- `idx_error_cluster_resolved` ON (resolved_at)
- `idx_error_cluster_archived` ON (archived_at)

---

### route_health_event
Tracks health status changes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| route_id | VARCHAR(255) | FK → route_metadata, NOT NULL | Associated route |
| old_status | VARCHAR(20) | | Previous status |
| new_status | VARCHAR(20) | NOT NULL | New status |
| reason | TEXT | | Change reason |
| timestamp | TIMESTAMP | DEFAULT NOW() | Event timestamp |

**Indexes:**
- `idx_health_event_route_id` ON (route_id)
- `idx_health_event_timestamp` ON (timestamp DESC)

---

### error_brain_analysis
Stores AI analysis results.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| route_id | VARCHAR(255) | FK → route_metadata, NOT NULL | Associated route |
| error_cluster_id | UUID | FK → error_cluster | Analyzed error |
| suggestions | JSONB | NOT NULL | Array of suggestions |
| selected_suggestion_index | INTEGER | | User-selected suggestion |
| phase | VARCHAR(50) | | Analysis phase |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- `idx_analysis_route_id` ON (route_id)
- `idx_analysis_error_cluster` ON (error_cluster_id)

---

### error_brain_patch
Stores applied patches.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| route_id | VARCHAR(255) | FK → route_metadata, NOT NULL | Associated route |
| analysis_id | UUID | FK → error_brain_analysis | Source analysis |
| patch_content | TEXT | NOT NULL | Patch code |
| applied_at | TIMESTAMP | DEFAULT NOW() | Application timestamp |
| verification_status | VARCHAR(20) | DEFAULT 'pending' | Status: pending, passed, failed |
| verification_message | TEXT | | Verification result |

**Indexes:**
- `idx_patch_route_id` ON (route_id)
- `idx_patch_analysis_id` ON (analysis_id)

---

### route_interaction_log
Tracks user interactions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| route_id | VARCHAR(255) | FK → route_metadata, NOT NULL | Associated route |
| user_id | VARCHAR(255) | | User identifier |
| interaction_type | VARCHAR(50) | NOT NULL | Type: view, navigate, analyze, patch_apply |
| metadata | JSONB | DEFAULT '{}' | Additional data |
| session_id | VARCHAR(255) | | Session identifier |
| duration_ms | INTEGER | | Interaction duration |
| success | BOOLEAN | | Success flag |
| error_message | TEXT | | Error if failed |
| ip_address | VARCHAR(45) | | Client IP |
| user_agent | TEXT | | Browser user agent |
| created_at | TIMESTAMP | DEFAULT NOW() | Interaction timestamp |

**Indexes:**
- `idx_interaction_route_id` ON (route_id)
- `idx_interaction_user_id` ON (user_id)
- `idx_interaction_type` ON (interaction_type)
- `idx_interaction_created` ON (created_at DESC)

---

## Archive Tables

### error_cluster_archive
Archived error clusters (90+ days old).

Same schema as `error_cluster` plus:
| Column | Type | Description |
|--------|------|-------------|
| archived_at | TIMESTAMP | Archive timestamp |
| archived_from_table | VARCHAR(100) | Source table |
| archive_reason | TEXT | Archival reason |

---

### route_interaction_log_archive
Archived interactions (180+ days old).

Same schema as `route_interaction_log` plus:
| Column | Type | Description |
|--------|------|-------------|
| archived_at | TIMESTAMP | Archive timestamp |
| archived_from_table | VARCHAR(100) | Source table |
| archive_reason | TEXT | Archival reason |

---

## Views

### archive_statistics
Provides overview of archived data.

```sql
CREATE VIEW archive_statistics AS
SELECT
  'error_cluster_archive' as table_name,
  COUNT(*) as record_count,
  MIN(archived_at) as oldest_archive,
  MAX(archived_at) as newest_archive,
  pg_size_pretty(pg_relation_size('error_cluster_archive')) as table_size
FROM error_cluster_archive
UNION ALL
SELECT
  'route_interaction_log_archive',
  COUNT(*),
  MIN(archived_at),
  MAX(archived_at),
  pg_size_pretty(pg_relation_size('route_interaction_log_archive'))
FROM route_interaction_log_archive;
```

---

## Migrations

Migrations are managed by Drizzle Kit and stored in `backend/migrations/`.

| Migration | Description |
|-----------|-------------|
| 001_create_route_metadata.sql | Create route_metadata table |
| 002_create_error_cluster.sql | Create error_cluster table |
| 003_create_health_events.sql | Create route_health_event table |
| 004_create_error_brain.sql | Create analysis and patch tables |
| 005_create_interaction_log.sql | Create interaction log table |
| 006_add_indexes.sql | Add performance indexes |
| 007_create_archive_tables.sql | Create archive tables and view |

**Running Migrations:**
```bash
npm run db:migrate
```

---

## Performance Considerations

### Indexes
All foreign keys and frequently queried columns are indexed. The schema uses:
- B-tree indexes for equality and range queries
- Partial indexes for archived_at IS NULL queries
- Composite indexes for common query patterns

### Query Optimization
- Use `LIMIT` and `OFFSET` for pagination
- Filter by `archived_at IS NULL` for active records
- Use `ORDER BY timestamp DESC` with index support

### Connection Pooling
- Pool size: 10 connections (configurable)
- Idle timeout: 30 seconds
- Connection timeout: 5 seconds

---

## Soft Delete Pattern

Records are never physically deleted. Instead:
1. Set `archived_at = NOW()` on the main table
2. Archival job moves old records to archive tables
3. Archive tables retain data indefinitely

This ensures:
- No data loss
- Audit trail preservation
- Historical analysis capability
