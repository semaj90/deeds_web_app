# npm run dev:gpu Fixes — Priority Order

**Status:** Context-saved guide for sequential application  
**Date:** 2026-08-05  
**Location:** Each fix references exact file + line

---

## FIX #1: Outbox Logger — Expose Real PostgreSQL Error (BLOCKER)

**File:** `sveltekit-frontend/src/lib/server/queue/outbox.ts:200`

**Current (hides cause):**
```typescript
console.warn('[outbox] publish batch error:', (err as Error).message);
```

**Add this helper function at top of file:**
```typescript
function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { value: String(error) };
  }
  const cause = error.cause as Error | undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: cause ? {
      name: cause.name,
      message: cause.message,
      code: (cause as any).code,
      detail: (cause as any).detail,
      hint: (cause as any).hint,
      table: (cause as any).table,
      column: (cause as any).column,
      constraint: (cause as any).constraint,
      stack: cause.stack
    } : undefined
  };
}
```

**Replace line 200:**
```typescript
console.error('[outbox] publish batch error:', JSON.stringify(errorDetails(err), null, 2));
```

**Action after fix:**
```bash
npm run dev:gpu
# Watch console for PostgreSQL error code (42P01, 42703, etc.)
# See list below to diagnose next
```

**PostgreSQL Error Codes Reference:**
- `42P01` — table does not exist (workflow_outbox missing)
- `42703` — column does not exist (schema mismatch)
- `42501` — permission denied
- `25006` — transaction is read-only
- `08006` — connection failure
- `23505` — unique constraint violation

---

## FIX #2: Verify workflow_outbox Table Exists

**After #1 logs the error code, check live database:**

```bash
# Test connection
$env:PGPASSWORD='<password_from_.env>'
psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db -v ON_ERROR_STOP=1 -c "\dt workflow_outbox"
```

**If table is missing, find the migration:**
```bash
rg -n "workflow_outbox" sveltekit-frontend/ --type ts --type sql | grep CREATE
```

**Expected schema minimum:**
```sql
CREATE TABLE workflow_outbox (
  id uuid PRIMARY KEY,
  routing_key text NOT NULL,
  exchange text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failed_at timestamptz
);

-- If permissions error, run:
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workflow_outbox TO legal_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
```

---

## FIX #3: Embedding Contract — Match Request/Response Schema

**File:** `sveltekit-frontend/src/routes/api/embed/+server.ts`

**Step 1: Test Ollama directly**
```powershell
$body = @{
  model = "embeddinggemma:latest"
  input = "embedding smoke test"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/embed" `
  -ContentType "application/json" -Body $body
# Expected: { embedding: [0.123, -0.456, ...] }
```

**Step 2: Find the route schema**
```bash
rg -n "z\.object.*input" sveltekit-frontend/src/routes/api/embed/+server.ts
```

**Step 3: Standardize all callers**

Search for all calls to `/api/embed`:
```bash
rg -n "fetch.*api/embed" sveltekit-frontend/src --type ts
```

Ensure all use consistent shape:
```typescript
type EmbedRequest = {
  input: string | string[];
  model?: string;
};

// Caller example:
const body: EmbedRequest = {
  input: "embedding smoke test",
  model: "embeddinggemma:latest"
};

const res = await fetch("/api/embed", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});
```

**Step 4: Route handler**
```typescript
export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  
  if (!body?.input || (Array.isArray(body.input) && body.input.length === 0)) {
    return json({ error: "INVALID_EMBED_REQUEST" }, { status: 400 });
  }

  // Call Ollama with normalized input
  const inputs = Array.isArray(body.input) ? body.input : [body.input];
  // ... rest of handler
}
```

---

## FIX #4: GPU Diagnostics — Fix VRAM Reporting

**File:** `sveltekit-frontend/src/lib/gpu/libtorch-bridge.ts` (search for "need 0 MB")

**Current bug:**
```typescript
const requiredMB = Math.floor(requiredBytes / (1024 * 1024));
// ^ Rounds DOWN → displays 0 MB for small allocations
```

**Add these helpers:**
```typescript
const MIB = 1024 * 1024;

type VramDecision = {
  requiredBytes: number;
  reserveBytes: number;
  freeBytes: number | null;
};

function canUseGpu(decision: VramDecision): boolean {
  const { requiredBytes, reserveBytes, freeBytes } = decision;
  if (!Number.isFinite(requiredBytes) || requiredBytes <= 0) return false;
  if (freeBytes === null) return false;
  if (!Number.isFinite(freeBytes)) return false;
  return freeBytes >= requiredBytes + reserveBytes;
}

function formatMiB(bytes: number | null): number | null {
  return bytes === null ? null : Math.ceil(bytes / MIB * 10) / 10;
}
```

**Replace the graphSimilarity fallback log:**
```typescript
const requiredBytes = estimateGraphSimilarityBytes(input);
const reserveBytes = 512 * MIB;
const freeBytes = getFreeVramBytes();

if (!canUseGpu({ requiredBytes, reserveBytes, freeBytes })) {
  console.warn(
    '[libtorch] graphSimilarity CPU fallback',
    {
      requiredMiB: formatMiB(requiredBytes),
      reserveMiB: formatMiB(reserveBytes),
      totalNeededMiB: formatMiB(requiredBytes + reserveBytes),
      freeMiB: formatMiB(freeBytes),
      reason: freeBytes === null ? 'VRAM_QUERY_UNAVAILABLE' : 'INSUFFICIENT_HEADROOM'
    }
  );
  return graphSimilarityCpu(input);
}
```

**Emit warning only once per condition:**
```typescript
const emittedWarnings = new Set<string>();

function warnOnce(key: string, message: string, metadata: unknown): void {
  if (emittedWarnings.has(key)) return;
  emittedWarnings.add(key);
  console.warn(message, metadata);
}

// Usage:
warnOnce(
  'graphSimilarity:insufficient-vram',
  '[libtorch] graphSimilarity using CPU',
  { requiredMiB, reserveMiB, freeMiB }
);
```

---

## FIX #5: Chat Warmup Timeout — Prevent Silent Failures

**File:** `sveltekit-frontend/src/lib/server/ace/gemma4-invocation.ts` (search for warmup or boot)

**Test TurboQuant directly first:**
```powershell
$body = @{
  model = "hforf"
  messages = @(@{ role = "user"; content = "Reply with OK" })
  max_tokens = 4
  temperature = 0
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8090/v1/chat/completions" `
  -ContentType "application/json" -TimeoutSec 120 -Body $body
```

**Test Bifrost:**
```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3040/v1/chat/completions" `
  -ContentType "application/json" -TimeoutSec 120 -Body $body
```

**Add proper warmup with long timeout:**
```typescript
async function warmChatModel(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 120s, not 30s

  try {
    const response = await fetch('http://127.0.0.1:3040/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hforf',
        messages: [{ role: 'user', content: 'Reply with OK' }],
        max_tokens: 2,
        temperature: 0
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Warmup returned ${response.status}: ${text}`);
    }

    console.info('[boot] Chat model warmup ready');
  } finally {
    clearTimeout(timeout);
  }
}
```

**IMPORTANT: Don't run embedding warmup concurrently on 8GB GPU**
- Gemma4 ≈ 7.5 GB
- embeddinggemma ≈ 2 GB
- Sequential startup only

---

## Checklist After All Fixes

- [ ] **OUTBOX_CAUSE_LOGGED** — errorDetails() prints PostgreSQL error code
- [ ] **WORKFLOW_OUTBOX_TABLE_EXISTS** — psql query succeeds
- [ ] **OUTBOX_QUERY_DIRECT_PSQL** — SELECT from workflow_outbox returns rows
- [ ] **EMBED_SCHEMA_MATCHES** — All callers send same request shape
- [ ] **OLLAMA_DIRECT_EMBED_WORKS** — curl/Invoke-RestMethod returns embeddings
- [ ] **VRAM_REQUIRED_FINITE** — Math.ceil, not Math.floor
- [ ] **GPU_FALLBACK_LOG_ONCE** — Warning emitted once per condition, not per item
- [ ] **TURBOQUANT_DIRECT_WORKS** — Direct :8090 warmup succeeds
- [ ] **BIFROST_WARMUP_WORKS** — :3040 responds after TurboQuant ready
- [ ] **FIRST_BOOT_TIMEOUT_120S** — Not 30s

---

## Session Workflow

**Session 1:** Apply FIX #1, restart app, capture PostgreSQL error code
**Session 2:** Apply FIX #2, verify table & permissions
**Session 3:** Apply FIX #3, test all embed callers
**Session 4:** Apply FIX #4, verify VRAM numbers realistic
**Session 5:** Apply FIX #5, test warmup with long timeout

---

**Notes:**
- Each fix is independent after #1 (database must be healthy first)
- Test sequentially to isolate issues
- Save PostgreSQL error code from #1 for reference