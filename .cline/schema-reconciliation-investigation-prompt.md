# Cline Task: Schema Reconciliation Investigation (Read-Only)

## Objective

Investigate only the schema authority for these five objects. Do NOT edit files yet.

- `atlas_tree_nodes`
- `atlas_summary_layers`
- `atlas_topology_index`
- `atlas_feature_packets.tree_node_id`
- `scenario_cache.pipeline_key`

## Investigation Steps (In Order)

### Phase 1: Locate Declarations

Use separate `search_files` calls for each file type (TypeScript, SQL, MJS).

**Search TypeScript/Drizzle declarations**:
```
<search_files>
<path>.</path>
<regex>CREATE TABLE\s+(IF NOT EXISTS\s+)?atlas_tree_nodes|pgTable\(['"]atlas_tree_nodes|atlasTreeNodes\s*=</regex>
<file_pattern>*.ts</file_pattern>
</search_files>
```

Repeat for `atlas_summary_layers`, `atlas_topology_index`, `atlas_feature_packets`, `scenario_cache`.

**Search SQL migrations**:
```
<search_files>
<path>.</path>
<regex>CREATE TABLE\s+(IF NOT EXISTS\s+)?atlas_tree_nodes|ALTER TABLE\s+atlas_tree_nodes</regex>
<file_pattern>*.sql</file_pattern>
</search_files>
```

**Search MJS scripts**:
```
<search_files>
<path>.</path>
<regex>atlas_tree_nodes|atlas_summary_layers|atlas_topology_index</regex>
<file_pattern>*.mjs</file_pattern>
</search_files>
```

### Phase 2: Locate Writes (INSERT / UPDATE)

**TypeScript inserts/updates**:
```
<search_files>
<path>.</path>
<regex>insert\(atlasTreeNodes\)|INSERT\s+INTO\s+atlas_tree_nodes|update\(atlasTreeNodes\)|UPDATE\s+atlas_tree_nodes</regex>
<file_pattern>*.ts</file_pattern>
</search_files>
```

**SQL inserts/updates**:
```
<search_files>
<path>.</path>
<regex>INSERT\s+INTO\s+atlas_tree_nodes|UPDATE\s+atlas_tree_nodes|INSERT\s+INTO\s+scenario_cache</regex>
<file_pattern>*.sql</file_pattern>
</search_files>
```

### Phase 3: Locate Reads (Joins and Queries)

```
<search_files>
<path>.</path>
<regex>tree_node_id|pipeline_key|source_ref|packet_key|feature_id</regex>
<file_pattern>*.ts</file_pattern>
</search_files>
```

### Phase 4: Inspect Live PostgreSQL Schema

Use `read_file` or `execute` to query the live database (if reachable at :5434 host or :5432 Docker).

**Column schema**:
```sql
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN (
  'atlas_tree_nodes',
  'atlas_summary_layers',
  'atlas_topology_index',
  'atlas_feature_packets',
  'scenario_cache'
)
ORDER BY table_name, ordinal_position;
```

**Constraints**:
```sql
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
 AND tc.table_schema = ccu.table_schema
WHERE tc.table_name IN (
  'atlas_tree_nodes',
  'atlas_summary_layers',
  'atlas_topology_index',
  'atlas_feature_packets',
  'scenario_cache'
);
```

### Phase 5: Produce Schema Reconciliation Report

Create a table showing for each object:

| Object | Declared Schema | Live Schema | Owner Module | Primary Key | Foreign Keys | Write Paths | Inconsistencies | Status |
|--------|-----------------|-------------|--------------|-------------|--------------|-------------|-----------------|--------|
| `atlas_tree_nodes` | ... | ... | ... | ... | ... | ... | ... | PROVEN/INFERRED/UNKNOWN |

Mark every conclusion as:
- **PROVEN**: Found in code + database matches
- **INFERRED**: Found in code but not verified in live database
- **UNKNOWN**: Could not locate or verify

## Execution Rules

✅ Use only tools exposed by Cline (search_files, read_file, execute, etc.).  
✅ Follow each tool's schema exactly.  
✅ Do NOT invent wrapper elements or parameters (e.g., no `<tool_use>`, no `<tool_name>`).  
✅ Do NOT print tool calls as ordinary text — invoke them directly as XML.  
✅ Use workspace-relative paths (`.`) unless an absolute path is explicitly required.  
✅ Escape literal dots in regex: `atlas_feature_packets\.tree_node_id`.  
✅ Use glob patterns for `file_pattern`: `*.ts`, not regex pipes like `.ts|.js`.  
✅ Do NOT invent tool parameters like `task_progress`.  

## When a Tool Call Fails

1. Correct only the malformed parameters.
2. Retry once with the corrected call.
3. If it fails again, move to a different investigation phase.
4. Do NOT repeat the same malformed call.

## Expected Deliverable

A concise reconciliation report showing:
- Each object's declared schema (from Drizzle or SQL)
- Live database schema (from information_schema)
- Owner modules (which files declare or write to each table)
- Primary keys, foreign keys, and write paths
- Any inconsistencies or mismatches
- Confidence level (PROVEN / INFERRED / UNKNOWN) for each conclusion

## Do NOT

❌ Edit any files.  
❌ Create new tables or migrations.  
❌ Make assumptions about schema — investigate and verify.  
❌ Proceed to repair or implementation phases until this report is complete.  

---

**Status**: Ready for Cline investigation.  
**Scope**: Read-only schema audit of five critical objects.  
**Expected Duration**: ~30 minutes for thorough investigation.  
**Next Step**: Start with Phase 1 (Locate Declarations).
