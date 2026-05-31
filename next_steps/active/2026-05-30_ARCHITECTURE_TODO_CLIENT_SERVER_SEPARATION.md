# Architecture TODO — Client/Server Separation + XState Deprioritization

**Date**: 2026-05-30
**Driver**: With Bits UI v2 (runes-aware), Svelte 5 runes, and the new feature/* barrels, the original XState v5 orchestration layer is no longer load-bearing for most flows.

---

## 1. XState v5 — De-prioritized but NOT removed

**Rationale**: Bits UI v2 primitives + Svelte 5 runes handle UI state machines (dialog open/closed, multi-step forms, async fetch states) ergonomically with no machine boilerplate. XState is still correct for:

- ❌ **NO LONGER NEEDED**: UI toggles, modal lifecycle, button states, hover/focus — use bits-ui + runes
- ❌ **NO LONGER NEEDED**: Multi-step wizards with linear progression — use a `$state.raw({ step: 1 })` rune
- ✅ **STILL USE XSTATE for**: explicit retry/back-off graphs, long-running multi-actor orchestration (e.g., `retrieval-machine.ts`'s 2-stage Fuse → Qdrant rerank), anything you'd otherwise hand-roll with `Promise.race` + flags + watchdog timeouts
- ✅ **STILL USE XSTATE for**: any flow that benefits from a visualizable state diagram (debugging RL feedback loops, GRPO training pipelines)

**Action items**:
- [ ] Audit `src/lib/machines/*.ts` — flag every machine for "keep | migrate to runes | retire"
- [ ] For `migrate-to-runes`: replace `useMachine(...)` with a `.svelte.ts` class-backed `$state` store
- [ ] Keep `retrieval-machine.ts`, `chat-machine.ts` (long-running, multi-actor)
- [ ] Remove dev dependencies on `@xstate/svelte` from any file that gets fully migrated

---

## 2. Client vs Server: explicit separation lanes

The 8 feature barrels in `sveltekit-frontend/src/lib/server/features/*` are server-only. Need a matching client lane.

### Proposed structure

```
sveltekit-frontend/src/lib/
├── client/                    # NEW — browser-safe only
│   ├── features/
│   │   ├── evidence/          (UI helpers, fetch wrappers, client-side stores)
│   │   ├── cases/
│   │   ├── rag/
│   │   └── ...
│   ├── runes/                 (.svelte.ts stores — replacement for XState)
│   └── rpc/                   (typed fetch wrappers to server features)
├── server/                    # existing — server-only
│   └── features/              # 8 barrels we already created
└── shared/                    # NEW — both lanes can import
    ├── types/                 (Zod schemas, DTOs)
    └── constants/
```

### RPC pattern (replaces ad-hoc fetch)

```ts
// src/lib/client/rpc/evidence.ts
import type { Evidence } from '$lib/shared/types/evidence';

export const evidence = {
  async listByCase(caseId: string): Promise<Evidence[]> {
    const r = await fetch(`/api/cases/${caseId}/evidence`);
    if (!r.ok) throw new Error(`evidence.listByCase failed: ${r.status}`);
    return r.json();
  },
  async upload(caseId: string, file: File): Promise<Evidence> {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/cases/${caseId}/evidence`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`evidence.upload failed: ${r.status}`);
    return r.json();
  },
};
```

Consumers get type safety + no `?.` chains + central error handling. Replaces ~80% of XState fetch state machines.

### WASM-like server-side RPC (deferred — but planning lane)

The longer-term shape: client calls `rpc.evidence.upload(...)` and it transparently runs server-side via SvelteKit's form actions + remote-functions API. Today: write the wrapper, tomorrow: swap the implementation. Zero consumer changes.

---

## 3. Action items (ordered)

### Phase A — Documentation only (no code moves)
- [x] Append `MERGED-WITH-CANONICAL` banner to 10 introspect-extracted sidecars (done 2026-05-30)
- [ ] Update CLAUDE.md `### Svelte 5 Runes` section with "when to use bits-ui+runes vs XState" decision table
- [ ] Document the `client/server/shared` layout under `docs/architecture/client-server-separation.md`

### Phase B — Shared lane (low risk)
- [ ] Create `src/lib/shared/types/` and move pure-type files from server (Zod schemas, DTOs)
- [ ] Verify each moved type has no server-only imports (db/, redis/, etc.)

### Phase C — Client RPC lane (medium risk)
- [ ] Create `src/lib/client/rpc/` with one file per feature pillar (evidence, cases, rag, etc.)
- [ ] Migrate top 5 components that fetch from `/api/*` to use the RPC wrappers
- [ ] Smoke test: dev server up, click through evidence upload flow

### Phase D — XState retire (per-machine)
- [ ] For each machine in `src/lib/machines/`, decide keep | migrate | retire
- [ ] For migrate: rewrite as `.svelte.ts` class with `$state` runes
- [ ] For retire: delete file + all `useMachine(...)` calls
- [ ] Keep: `retrieval-machine.ts`, `chat-machine.ts`, anything with explicit parallel branches

---

## 4. Why this matters (the narrative)

- **Bits UI v2** handles open/closed state via `$bindable()` runes natively
- **Svelte 5 `$state` proxy** makes nested mutation work — kills 90% of "we need a store" use cases
- **SvelteKit form actions + Superforms v2** kill 80% of fetch-state machines
- **`fetch()` + `Promise.all` + try/catch** kills 80% of explicit retry machines
- What REMAINS for XState: multi-actor orchestration (RAG retrieval graph, error-brain HMM, ACE multi-lane scoring)

That's the new equilibrium. The architecture TODO above is how we get there.

---

## 5. Cross-references

- Drift snapshot: `.tmp/drizzle-introspect/DRIFT_REPORT.md`
- Real-gap table list: `.tmp/drizzle-introspect/real-gap-v2.txt` (26 tables, down from 96)
- 10 merged sidecars: `sveltekit-frontend/src/lib/server/db/schema/{case-*,legal-documents,statute-chunks,timeline-events,workspace*}.ts`
- Feature barrels: `sveltekit-frontend/src/lib/server/features/{ai,cases,codebase-intel,evidence,identity,legal-corpus,observability,rag}/index.ts`
- Existing XState machines (audit candidates): `find sveltekit-frontend/src/lib/machines -name '*.ts'`