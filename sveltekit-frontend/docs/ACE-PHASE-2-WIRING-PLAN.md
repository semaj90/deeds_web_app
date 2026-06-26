# ACE Phase 2: Retrieval Loop Wiring (In Progress)

**Status**: Phase 1 infrastructure ✅ complete (reader, writer, validator, schema). Phase 2 wiring in progress.

**Objective**: Wire ACE into the full retrieval → synthesis → caching loop.

## Architecture

```
Retrieval Candidates (UnifiedRetrievalResult[])
  ↓ (Vector ANN or Graph + Karpathy blend)
ACE Packet Reader (readACEPacketsFromPostgres/readACEPacketsFromRedis)
  ↓ (Load full packets with summaries)
ACE Validator (validatePacketsForGemma4)
  ↓ (Injection guard + schema validation — MUST PASS)
ACE Context Assembler (AceContextAssembler)
  ↓ (Token-aware context packing, bounded prompt)
Gemma4 Synthesis (gemma4-rotorquant:latest :8090)
  ↓ (Receives ONLY ACE packets, no raw DB refs)
ACE Packet Writer (writeACEPacketToPostgres)
  ↓ (Persist synthesis packet: packet_key, summary, metadata)
Redis L1 Cache (bifrost:packet:{packet_key}, centroid:{feature_id})
  ↓ (24h TTL for subsequent queries)
ACE Materializer (dryrun/apply)
  ↓ (Sync payload to Qdrant/TurboVec mirrors)
Query Cache Hit (next query returns cached synthesis)
```

## Files to Create / Modify

### Phase 2.1: Context Assembler (`src/lib/server/ace/ace-context-assembler.ts`)

**Purpose**: Convert retrieval candidates into Gemma4-safe ACE context.

**Inputs**:
- Retrieved candidate packets (from Postgres/Redis/Qdrant)
- Query string + user context (case ID, etc.)
- Token budget (default 6000, reserved for answer: 2000)

**Outputs**:
- `AssembledContext`: bounded text, tokens used, source trail
- Validation markers (injection-safe, schema-compliant)

**Rules**:
- Load full packet summaries via reader
- Bound token count: `sum(candidate.summary) + query + preamble ≤ 6000`
- Emit token-aware trim if over budget
- Preserve packet_key for traceability (used in writer)
- Never emit raw database references

**Implementation**:
```typescript
export interface AssemblyOptions {
  tokenBudget?: number;  // Default 6000
  includeMetadata?: boolean;
  sourceTrail?: boolean;
}

export interface AssembledContext {
  text: string;  // Gemma4-safe prompt context
  tokensUsed: number;
  packetKeys: string[];  // For traceability
  metadata: {
    candidateCount: number;
    trimmedAt?: number;  // Position if truncated
    validationFlags: string[];
  };
}

export class AceContextAssembler {
  constructor(
    private db: PostgresJsDatabase,
    private reader: AcePacketReader,
    private validator: AcePacketValidator,
  ) {}

  async assembleContext(
    candidates: UnifiedRetrievalResult[],
    query: string,
    options?: AssemblyOptions
  ): Promise<AssembledContext>
}
```

### Phase 2.2: ACE Materializer (`src/lib/server/ace/ace-materializer.ts`)

**Purpose**: Sync ACE packet metadata to vector mirrors (Qdrant/TurboVec).

**Inputs**:
- ACE packet (packet_key, feature_id, source_ref, summary, som_row/col, cluster_id)
- Dry-run flag (preview without write)

**Outputs**:
- `MaterializationResult`: success status, Qdrant point ID, metadata updated

**Rules**:
- Postgres is truth (atlas_packets)
- Qdrant payload: include packet_key, feature_id, source_ref, summary, cluster_id, som_row, som_col
- Redis L1: cache payload under `bifrost:packet:{packet_key}` (24h TTL)
- Never write raw table references to Qdrant (only summaries)

**Implementation**:
```typescript
export interface MaterializationOptions {
  dryRun?: boolean;
  qdrantCollection?: string;  // Default 'codebase_chunks_768'
  redisTTL?: number;  // Default 86400 (24h)
}

export interface MaterializationResult {
  success: boolean;
  qdrantPointId?: string;
  redisKey?: string;
  error?: string;
  metadata: {
    bytesSynced: number;
    duration: number;
  };
}

export class AceMaterializer {
  constructor(
    private db: PostgresJsDatabase,
    private qdrant: QdrantClient,
    private redis: RedisClient,
  ) {}

  async materializePackets(
    packets: AtlasPacket[],
    options?: MaterializationOptions
  ): Promise<MaterializationResult[]>
}
```

### Test Scripts

#### `scripts/atlas/smoke-semantic-index-loop.mjs`

End-to-end smoke test: retrieval → ACE → Gemma4 (mock) → cache → materializer (dry-run).

**Flow**:
1. Mock retrieval candidate (or load real from Postgres)
2. Read full packet via AcePacketReader
3. Validate via AcePacketValidator
4. Assemble context via AceContextAssembler
5. Mock Gemma4 synthesis (return a fake answer)
6. Write synthesis packet via AcePacketWriter
7. Check Redis cache hit
8. Dry-run materializer (print what would sync to Qdrant)

**Output**: `.tmp/semantic-index-loop-smoke.json` with stats.

#### `scripts/atlas/proof-four-lanes-orchestrator.mjs` (update)

Add optional Lane 5 (ACE boundary validation):

1. Load 1 real atlas_packets row
2. Convert to ACE context
3. Validate injection-free
4. Simulate Gemma4 synthesis
5. Persist to Postgres
6. Verify Redis cache
7. Dry-run Qdrant sync

**Output**: `.tmp/ace-lane-proof.json` with pass/fail.

## npm Scripts

Add to `package.json`:

```json
{
  "atlas:smoke:semantic-loop": "node scripts/atlas/smoke-semantic-index-loop.mjs",
  "atlas:smoke:semantic-loop:verbose": "node scripts/atlas/smoke-semantic-index-loop.mjs --verbose",
  "atlas:proof:four-lanes:ace": "node scripts/atlas/proof-four-lanes-orchestrator.mjs --include-lane-5",
  "atlas:proof:four-lanes:all": "npm run atlas:proof:four-lanes && npm run atlas:proof:four-lanes:ace"
}
```

## Dependencies Already in Place

✅ **AcePacketReader** — reads from Postgres (atlas_packets) + Redis (bifrost:packet:*)
✅ **AcePacketWriter** — writes to Postgres (atlas_packets) + Redis
✅ **AcePacketValidator** — injection guard + Zod schema validation
✅ **HyperRAG RPC** — defines packet state + retrieval contract
✅ **Atlas packets schema** — canonical table with all needed fields

## What's Missing (Phase 2)

⏳ **AceContextAssembler** — token-aware context packing
⏳ **AceMaterializer** — Qdrant/TurboVec payload sync
⏳ **Smoke tests** — end-to-end verification scripts

## Timeline

- **Today (Session 81)**: Create context-assembler + materializer
- **Tomorrow**: Wire into context-assembler.ts (replace stub), add smoke tests
- **Day 3**: Run four-lane proof + Lane 5, verify cache hits
- **Day 4**: P5 GPU acceleration health audit (depends on ACE loop working)

## Hard Rules

1. **Postgres is truth** — never patch Qdrant directly
2. **Validator runs first** — no synthesis without validation pass
3. **Token budgets** — context assembler MUST respect 6000-token ceiling
4. **Packet keys** — every synthesis packet needs a unique packet_key for traceability
5. **Gemma4 only** — LLM receives ONLY ACE context, never raw retrieval results

## References

- `src/lib/server/ace/index.ts` — barrel exports
- `src/lib/server/db/schema/atlas-packets.ts` — canonical packet table
- `src/lib/server/retrieval/index.ts` — retrieval types (UnifiedRetrievalResult)
- `docs/architecture/trace-kag-web-development-guide.md` — route/retrieval patterns
