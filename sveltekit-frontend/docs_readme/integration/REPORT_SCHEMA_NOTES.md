# Report Schema Notes — RESOLVED

## Issue Resolution (March 1, 2026)

**Root Cause:** The dev server was connecting to a local PostgreSQL instance on the host machine (port 5432) instead of the Docker containers. This local instance had an outdated `reports` table schema missing the `generated_at` column.

**Solution:** Dropped and recreated the `reports` table in the local PostgreSQL instance with the correct schema matching `schema-postgres.ts`.

## Database Setup

The application connects to:
- **Local PostgreSQL 17.6** on `127.0.0.1:5432` (host machine)
- `legal_ai_db` database
- User: `legal_admin`

Docker containers:
- `deeds-postgres-prod`: Internal Docker network only (no host port mapping)
- `phase66-postgres`: Mapped to host port 5434

## Actual Database Schema

The `reports` table has these fields:

```typescript
{
  id: uuid (PK)
  caseId: uuid (FK to cases.id)
  createdBy: uuid (FK to users.id)
  title: varchar(255)
  content: text  // Single field for HTML/text content
  status: reportStatusEnum  // Values: 'draft', 'pending', 'completed', 'published'
  generatedAt: timestamp  // ✅ NOW PRESENT
  metadata: jsonb  // Flexible JSON storage
  createdAt: timestamp
  updatedAt: timestamp
}
```

## Recommended Usage

```typescript
// Creating a report
await db.insert(reports).values({
  caseId: '...',
  title: 'Charging Memorandum',
  content: '<h1>...</h1>',  // HTML content
  status: 'draft',
  createdBy: userId,
  metadata: {
    reportType: 'charging_memo',  // Store type here
    template: 'v1',
    aiGenerated: true,
    rawOutput: '...'  // Original LLM output
  }
});
```

## Current Implementation Status

✅ **FIXED:** All report routes now work correctly with the proper schema:
- `/api/reports` - GET (list), POST (create), PATCH (bulk update), DELETE (bulk delete)
- `/api/reports/save` - POST (save content)
- `/api/reports/[id]/publish` - POST (publish), DELETE (unpublish)
- `/api/reports/[id]/export` - GET (HTML, Markdown, JSON, PDF-via-print)
- `/reports` - Listing page
- `/reports/new` - Creation wizard
- `/reports/[id]` - View page
- `/reports/[id]/edit` - TipTap editor

## Verification

```bash
# Test API endpoint
curl http://localhost:5173/api/reports

# Should return:
# {"success":true,"data":[...]}
```
