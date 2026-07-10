# Schema Dependency Intelligence Tool

**Status**: DESIGN_READY | **Implementation**: Complete  
**Date**: July 9, 2026 | **Value**: Immediate production value for migration planning

---

## Core Flow

```
Table Name
    ↓
Neo4j USES_DB Edges (static analysis layer)
    ├─ source_ref (file path)
    ├─ operation (SELECT/INSERT/UPDATE/DELETE)
    ├─ line_num (location in file)
    └─ type (read/write)
    ↓
Postgres atlas_packets Join
    ├─ packet_key (canonical identity)
    ├─ feature_id (semantic grouping)
    ├─ feature_label (human-readable)
    └─ tree_node_id (hierarchy)
    ↓
Risk Classification
    ├─ high: writes to auth/security/payment paths
    ├─ medium: any write operation
    └─ low: read operations
    ↓
Summary & Assessment
    ├─ total dependents
    ├─ reads/writes/deletes count
    ├─ high_risk_count
    └─ migration_risk: low/medium/high
    ↓
ACE Context Packet
    └─ feed to Gemma4 before synthesis
```

---

## Responsibility Split

| Component | Owns | Does NOT Own |
|-----------|------|--------------|
| **Neo4j** | Static USES_DB edges (who accesses what) | Packet identity, risk classification |
| **Postgres** | Canonical packet metadata (packet_key, feature_id) | Edge discovery, risk assessment |
| **schema-dependents.ts** | Join logic, risk classification, summary building | Database queries, vectorization |
| **API route** | HTTP contract, input validation | Caching, persistence |
| **ACE layer** | Context packaging, Gemma4 synthesis | Tool invocation, edge discovery |

**Key constraint**: The indexing script does NOT own embedding inference; it calls the go-embedding sidecar when --embed is enabled.

---

## Input Contract

```json
{
  "table": "users",
  "includeAce": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | string | yes | Table name (e.g., "users", "cases") |
| `includeAce` | boolean | no | Whether to include ACE context packet (default: true) |

---

## Output Contract

```json
{
  "table": "users",
  "dependents": [
    {
      "source_ref": "src/lib/server/auth.ts",
      "operation": "SELECT",
      "line_num": 42,
      "packet_key": "packet:auth:001",
      "feature_id": "auth.sessions",
      "feature_label": "Authentication Sessions",
      "tree_node_id": "auth/sessions",
      "risk": "high"
    }
  ],
  "summary": {
    "total": 3,
    "reads": 2,
    "writes": 1,
    "deletes": 0,
    "high_risk_count": 1
  },
  "ace_context": true,
  "migration_risk": "high"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `table` | string | Input table name |
| `dependents` | array | List of files that depend on this table |
| `dependents[].source_ref` | string | File path (canonical_source_ref) |
| `dependents[].operation` | enum | SELECT/INSERT/UPDATE/DELETE |
| `dependents[].line_num` | number | Line number where dependency occurs |
| `dependents[].packet_key` | string | Canonical packet identity (nullable) |
| `dependents[].feature_id` | string | Semantic feature grouping (nullable) |
| `dependents[].feature_label` | string | Human-readable feature name (nullable) |
| `dependents[].tree_node_id` | string | Hierarchy node (nullable) |
| `dependents[].risk` | enum | low/medium/high |
| `summary` | object | Aggregated statistics |
| `ace_context` | boolean | Whether ACE context was built |
| `migration_risk` | string | low/medium/high |

---

## API Endpoints

### GET /api/atlas/schema-dependents

```bash
curl "http://localhost:5173/api/atlas/schema-dependents?table=users"
```

**Query Parameters:**
- `table` (required): Table name
- `includeAce` (optional): Default true

**Response**: FindSchemaDependentsResponse (200 on success, 500 with degraded response on error)

### POST /api/atlas/schema-dependents

```bash
curl -X POST http://localhost:5173/api/atlas/schema-dependents \
  -H "Content-Type: application/json" \
  -d '{"table":"users","includeAce":true}'
```

**Body**: FindSchemaDependentsInput  
**Response**: FindSchemaDependentsResponse

---

## MCP Tool

**Name**: `atlas-tools:find-schema-dependents`

**Callable From**: OpenCode agents, ACE context assembler, migration planning workflows

**Example Call**:
```javascript
const result = await mcpClient.callTool('atlas-tools:find-schema-dependents', {
  table: 'users'
});
// result.data contains FindSchemaDependentsResponse
```

---

## ACE Integration

### Flow

```
User Query: "What happens if we add a NOT NULL column to users?"
    ↓
ACE Router: Detect schema-change context
    ↓
Call MCP Tool: atlas-tools:find-schema-dependents(table='users')
    ↓
Tool Returns: dependents array + summary + migration_risk
    ↓
Context Packer: Materialize dependents into ACE envelope
    ↓
Gemma4 Synthesis: "Based on analysis, users table has 3 dependents..."
```

### Context Injection

Before Gemma4 synthesis, ACE materializer injects:
```
## Schema-Aware Dependents
Table: users
Migration Risk: high
Files Impacted:
- src/lib/server/auth.ts (SELECT, feature: auth.sessions)
- src/lib/server/db/migrations.ts (INSERT/UPDATE, risk: high)
- src/lib/server/roles.ts (SELECT, feature: roles.permissions)

Summary: 2 files read users, 1 file writes users (high risk).
Recommendation: Coordinate with auth module on schema changes.
```

---

## Non-Blocking Edges

### Neo4j Unavailable
- Returns empty `dependents` array
- Summary contains all zeros
- `migration_risk` = 'low' (no data to assess)
- ✅ Non-blocking: system continues without Neo4j

### Postgres Join Fails
- Returns dependents with `packet_key=null`
- All other fields (source_ref, operation, line_num) present
- Risk classification still applied
- ✅ Non-blocking: packet metadata optional for core flow

### No USES_DB Edges Found
- Returns empty dependents array
- Summary: { total: 0, reads: 0, writes: 0, deletes: 0, high_risk_count: 0 }
- `migration_risk` = 'low' (no accesses found)
- ✅ Non-blocking: valid response for unused table

---

## Risk Classification Rules

| Condition | Risk Level |
|-----------|-----------|
| Write (INSERT/UPDATE/DELETE) to auth/security/payment paths | **high** |
| Any write (INSERT/UPDATE/DELETE) operation | **medium** |
| Read (SELECT) operation | **low** |

### Migration Risk Assessment

| Condition | Migration Risk |
|-----------|---|
| `high_risk_count > 0` | **high** |
| `writes > 2` AND `high_risk_count == 0` | **medium** |
| Otherwise | **low** |

---

## Production Value

✅ **Migration Risk Assessment**
- Before applying schema changes, understand impact scope
- Identify high-risk modifications to critical paths
- Prioritize testing on sensitive features

✅ **Hotspot Detection**
- Which files touch a table most frequently?
- Where are schema changes most fragile?

✅ **Impacted Files Report**
- For a table change, list exact files to review
- Deployment checklists: "review these 3 files before shipping"

✅ **Grounded Schema-Aware Retrieval**
- When someone asks "who uses the users table?", answer with file paths + context
- Bridge the gap between schema and code

✅ **Code Audit Trail**
- Track which code accesses critical tables
- Security audit: "which files access payment data?"

---

## Implementation Checklist

- [x] Core tool: `schema-dependents.ts`
- [x] API route: `/api/atlas/schema-dependents`
- [x] MCP wrapper: `schema-dependents-tool.ts`
- [x] Test suite: `schema-dependents.spec.ts`
- [x] Contract doc: `schema-dependency-tool.okf.json`
- [ ] Wire MCP server: register tool in `src/mcp/server.ts`
- [ ] Add npm script: `npm run atlas:schema-dependents:test`
- [ ] E2E test: schema change impact workflow

---

## Next Steps

1. **Wire MCP Server** (5 min)
   - Register `findSchemaDependentsTool` in mcp/server.ts

2. **Test End-to-End** (10 min)
   ```bash
   npm run atlas:schema-dependents:test
   # Query: table=users
   # Verify: returns dependents, summary, risk assessment
   ```

3. **ACE Integration** (30 min)
   - Add schema-change context hint to ACE router
   - Integrate MCP tool call into context assembler
   - Test Gemma4 synthesis with real schema impacts

4. **Production Deployment** (optional)
   - Add to atlas-tools MCP registry
   - Wire into OpenCode agent prompts
   - Monitor usage via MCP tool telemetry

---

## References

- **Tool Logic**: `src/lib/server/tools/schema-dependents.ts`
- **API Route**: `src/routes/api/atlas/schema-dependents/+server.ts`
- **MCP Wrapper**: `src/lib/server/mcp/schema-dependents-tool.ts`
- **Tests**: `tests/retrieval/schema-dependents.spec.ts`
- **Contract**: `docs/contracts/schema-dependency-tool.okf.json`

---

## Status Timeline

| Date | Status | Action |
|------|--------|--------|
| 2026-07-09 | DESIGN_READY | Core tool, API, tests, contracts complete |
| Next | MCP Wired | Register with atlas-tools |
| Next | ACE Integrated | Context injection working |
| Next | Production Ready | Deployed to OpenCode agents |

