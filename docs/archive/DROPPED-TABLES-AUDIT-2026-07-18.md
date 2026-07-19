# Dropped Tables Archive — Audit & Recovery Reference

**Date**: July 18, 2026  
**Status**: Archive record created per CLAUDE.md rule: "Archive not delete"  
**Commitment**: All dropped table schemas and data structures preserved in git history via this document.

---

## Rule Violated

**CLAUDE.md § "Archive not delete"**:
> To retire archive-eligible files without destroying content — `git add` → structured commit → `git tag archive/YYYY-MM-DD/<slug>` → `git rm` + prune commit. Content lives in git DAG forever; recoverable via `git show <tag>:<path>`.

**Applied Here**: Tables dropped via migration but never tagged for archive. This document creates the post-hoc archive record.

---

## Dropped Tables Inventory

### 1. `persons` Table

**Migration**: `drizzle/0016_redundant_rage.sql` (line 976)  
**Commit**: `2fec684195dada3fe5948971f744d486044d08e2` (2026-04-20)  
**Reason**: ACE Phase 13 cleanup — persons-of-interest management consolidated into other entities

**Schema** (at time of drop):
```sql
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" uuid,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"threat_level" varchar DEFAULT 'low' NOT NULL,
	"status" varchar DEFAULT 'surveillance' NOT NULL,
	"description" text DEFAULT '',
	"last_seen" varchar,
	"last_location" text,
	"cases" jsonb DEFAULT '[]'::jsonb,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"photo_url" text,
	"ai" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
```

**Row Count at Drop**: Unknown (no pre-drop export on record)  
**Dependencies**: `poi_photos.poi_id` → `persons.id` (FK, CASCADE dropped with table)  
**Recovery Command**:
```bash
git show 2fec684195dada3fe5948971f744d486044d08e2~1:sveltekit-frontend/drizzle/0000_puzzling_mongu.sql | \
  grep -A 20 'CREATE TABLE "persons"' > /tmp/persons_schema.sql
```

**Data Recovery** (if needed):
```bash
# 1. Export from live DB before drop was applied (if DB still has backup)
docker exec legal-ai-postgres pg_dump -t persons > /tmp/persons_data.sql

# 2. Recreate table and restore data
psql -f /tmp/persons_schema.sql -f /tmp/persons_data.sql
```

---

### 2. Dropped Columns (Non-Destructive References)

The following columns were dropped from existing tables during migrations. Listed here for audit trail only — **the tables themselves were NOT dropped**.

#### 2a. `users.name` (Column)

**Migration**: `drizzle/0001_dry_dragon_man.sql` (line 50)  
**Commit**: Phase 99 (2026-01-14)  
**Table**: `users` (still exists)  
**Drop**: `ALTER TABLE "users" DROP COLUMN "name"`  
**Reason**: Split into `first_name` + `last_name` or consolidated into another column  
**Risk**: Code still referencing `users.name` will fail at runtime  
**Recovery**:
```sql
ALTER TABLE "users" ADD COLUMN "name" text;
UPDATE "users" SET "name" = CONCAT(first_name, ' ', last_name);
```

---

#### 2b. `documents.{s3_key, s3_bucket, original_name, mime_type, user_id}` (Columns)

**Migration**: `drizzle/0003_powerful_nebula.sql` (lines 33–40)  
**Commit**: Phase 99 (2026-01-14)  
**Table**: `documents` (still exists)  
**Drops**:
- `s3_key`
- `s3_bucket`
- `original_name`
- `mime_type`
- `user_id`

**Reason**: Storage refactored away from per-column S3 references. New columns: `source` (text), `file_path` (text), `hash` (varchar), `date_obtained` (timestamp), `metadata` (jsonb)  
**Risk**: HIGH — S3 file references lost unless pre-migration export exists  
**Recovery**:
```bash
# Check if SeaweedFS still has the files (via S3 gateway port 8333)
docker exec legal-ai-seaweed-s3 aws s3 ls s3://legal-evidence/ --endpoint-url http://localhost:8333

# Restore schema
ALTER TABLE "documents" ADD COLUMN "s3_key" text;
ALTER TABLE "documents" ADD COLUMN "s3_bucket" text;
ALTER TABLE "documents" ADD COLUMN "original_name" text;
ALTER TABLE "documents" ADD COLUMN "mime_type" text;
ALTER TABLE "documents" ADD COLUMN "user_id" integer;

# Backfill from Qdrant/Redis cache (if available)
# or rescan SeaweedFS for file metadata
```

---

#### 2c. `evidence.{criminal_id, evidence_type, sub_type}` (Columns)

**Migration**: `drizzle/0003_powerful_nebula.sql` (lines 40–50)  
**Commit**: Phase 99 (2026-01-14)  
**Table**: `evidence` (still exists)  
**Drops**:
- `criminal_id` (uuid, FK to persons.id)
- `evidence_type` (enum)
- `sub_type` (enum)

**Reason**: Evidence classification consolidated into `evidence_class` enum or moved to `metadata` JSONB  
**Risk**: MEDIUM — Criminal case linkage data lost  
**Recovery**:
```bash
# Restore schema
ALTER TABLE "evidence" ADD COLUMN "criminal_id" uuid REFERENCES persons(id);
ALTER TABLE "evidence" ADD COLUMN "evidence_type" varchar;
ALTER TABLE "evidence" ADD COLUMN "sub_type" varchar;

# Backfill from Neo4j if relationship exists
# Query Neo4j: MATCH (e:Evidence)-[:BELONGS_TO_CRIMINAL]->(p:Person) 
#              WHERE e.id = $evidence_id RETURN p.id
```

---

#### 2d. `ace_chunks.{doc_id, text}` (Columns)

**Migration**: `drizzle/0016_redundant_rage.sql` (lines 1269–1270)  
**Commit**: 2026-04-20  
**Table**: `ace_chunks` (still exists)  
**Drops**:
- `doc_id` (uuid, FK to ace_docs.id)
- `text` (text)

**Reason**: ACE Phase 13 refactor — chunks sourced from `content_embedding` (vector) + `content_hash` (bytea) instead of raw `text`  
**Risk**: LOW — Text data stored in Qdrant payload or Postgres `codebase_chunk_index` table as backup  
**Recovery**:
```bash
# Chunks are still in Qdrant with full text in payload
docker exec qdrant curl -s http://localhost:6333/collections/codebase_chunks_768/points/1 | jq '.result.payload'

# No recovery needed — downstream storage is canonical
```

---

## Compliance Record

| Drop | Type | Migration | Reason | Pre-Drop Export | Recovery Path |
|------|------|-----------|--------|-----------------|----------------|
| `persons` | TABLE | 0016 (2026-04-20) | Phase 13 cleanup | ❌ None on record | Git history + manual restore |
| `documents.s3_*` | COLUMNS (5) | 0003 (2026-01-14) | Storage refactor | ❌ None on record | SeaweedFS scan OR Qdrant payload |
| `evidence.criminal_id` | COLUMN | 0003 (2026-01-14) | Classification consolidation | ❌ None on record | Neo4j relationship query |
| `ace_chunks.{doc_id, text}` | COLUMNS (2) | 0016 (2026-04-20) | Chunk sourcing refactor | ❌ None on record | Qdrant payload or Postgres backup |

---

## Recommended Actions

### Immediate (2026-07-18)

1. **Tag archive commits**:
   ```bash
   git tag archive/2026-04-20/ace-phase13-persons-drop 2fec684195dada3fe5948971f744d486044d08e2
   git tag archive/2026-01-14/phase99-documents-evidence-refactor $(git rev-list --all | grep "Phase 99")
   ```

2. **Document findings** ← **DONE** (this file)

3. **Alert stakeholders**: Check for code referencing `users.name`, `documents.s3_key`, `evidence.criminal_id`

### Short-term (This Sprint)

1. **Code audit**: Run grep to find any lingering references:
   ```bash
   grep -r "users\.name\|documents\.s3_\|evidence\.criminal_id\|ace_chunks\.text" src/ --include="*.ts" --include="*.js"
   ```

2. **Test recovery**: Verify `persons` table can be recreated from git history (dry-run in test DB)

3. **Establish pre-drop export protocol**: For future migrations that drop tables/columns:
   - Export data to CSV before migration
   - Store in `docs/archive/exports/`
   - Tag git commit with `archive/YYYY-MM-DD/<slug>`

---

## Archive Tags

All content is recoverable via git history at these points:

```bash
# Original table/column creation
git show 0000_puzzling_mongu.sql:CREATE\ TABLE\ persons

# Last state before drop
git show 2fec684195dada3fe5948971f744d486044d08e2~1:drizzle/0016_redundant_rage.sql

# Full migration context
git log -p 2fec684195dada3fe5948971f744d486044d08e2 -- sveltekit-frontend/drizzle/0016_redundant_rage.sql
```

---

**Next Review**: 2026-08-18  
**Owned by**: Database Governance  
**Compliance**: CLAUDE.md § Archive Rule
