# Audit Sidecar Migrations

Audit the five undocumented Drizzle sidecar migrations without reading whole files.

## Rules
- Do not ask the user to paste file contents.
- Do not use broad read first.
- Use rg/glob/bash first.
- Only read exact line ranges after rg identifies them.
- Build compact migration cards.

## Target files
- drizzle/0013_codeintel_indexes.sql
- drizzle/0016_codeintel_schema.sql
- drizzle/0016_courtroom_3d_animation.sql
- drizzle/0018_output_meta_manifold4.sql
- drizzle/0019_llm_context_cache.sql

### Step 1: Locate files
```powershell
rg --files | rg "drizzle/(0013_codeintel_indexes|0016_codeintel_schema|0016_courtroom_3d_animation|0018_output_meta_manifold4|0019_llm_context_cache)\.sql"
```

### Step 2: Extract schema operations only
```powershell
rg -n --context 3 "CREATE TABLE|ALTER TABLE|CREATE INDEX|DROP TABLE|DROP INDEX|INSERT INTO|UPDATE " drizzle/0013_codeintel_indexes.sql drizzle/0016_codeintel_schema.sql drizzle/0016_courtroom_3d_animation.sql drizzle/0018_output_meta_manifold4.sql drizzle/0019_llm_context_cache.sql
```

### Step 3: Produce one compact card per migration
```json
{
  "migration": "path",
  "purpose": "one sentence",
  "objects": [],
  "operations": [],
  "risk": "low|medium|high",
  "journalStatus": "missing",
  "recommendation": "journal|fold_into_schema|delete_if_obsolete|needs_review",
  "sourceRefs": ["path:Lx-Ly"]
}
```

### Step 4:
Only if a card is ambiguous, read the exact relevant line range.
