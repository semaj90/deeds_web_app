# Architecture: Client/Server Separation Layout & RPC Patterns

This document details the architectural layout, directory lanes, and RPC wrapper design for client-server boundaries, alongside decision matrices for state management using Svelte 5 Runes vs. XState v5.

## 1. Directory Layout Strategy

To prevent leakage of server-only imports (`$lib/server/*`, Node-only database connections, Redis clients, TRT/LibTorch native bridges) into browser-safe client files, the following directory division is established:

```
sveltekit-frontend/src/lib/
├── client/                    # Browser-safe files only (no Node/C++ bindings)
│   ├── features/              # Feature UI controllers, stores, local helpers
│   │   ├── evidence/
│   │   ├── cases/
│   │   └── rag/
│   ├── runes/                 # Class-backed .svelte.ts state stores
│   └── rpc/                   # Explicit typed fetch API wrappers
├── server/                    # Server-only execution files (Node, Drizzle, Redis)
│   ├── db/                    # Drizzle connection client & active schemas
│   └── features/              # 8 Server feature barrels (ai, cases, etc.)
└── shared/                    # Context-agnostic shared helpers (importable in both lanes)
    ├── types/                 # Zod schemas, TypeScript definition files, DTOs
    └── constants/             # Enums, constant configuration options
```

---

## 2. RPC Pattern

Instead of using ad-hoc, inline `fetch` calls scattered across UI components, all client-to-server API calls must be wrapped inside typed RPC controllers under `src/lib/client/rpc/`.

### Example RPC Interface
```ts
// src/lib/client/rpc/evidence.ts
import type { Evidence } from '$lib/shared/types/evidence';

export const rpcEvidence = {
  async listByCase(caseId: string): Promise<Evidence[]> {
    const res = await fetch(`/api/cases/${caseId}/evidence`);
    if (!res.ok) throw new Error(`rpc.evidence.listByCase failed: ${res.status}`);
    return res.json();
  },
  async upload(caseId: string, file: File): Promise<Evidence> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/cases/${caseId}/evidence`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`rpc.evidence.upload failed: ${res.status}`);
    return res.json();
  }
};
```

---

## 3. Decision Matrix: Svelte 5 Runes vs. XState v5

With Svelte 5 Runes (specifically `$state` and `$derived` proxies) and **Bits UI v2** runes-aware primitives, XState is no longer necessary for basic UI state.

| Use Case | State Store choice | Implementation Pattern |
|---|---|---|
| UI Toggles & Modals | Runes / Bits UI | Use `$bindable()` properties directly in Bits components |
| Linear Multi-step Wizards | Runes | Use class-backed `.svelte.ts` class with `$state.raw({ step: 1 })` |
| Async Form Validation | Runes / Superforms | Use `superValidate` with server-side Zod + client state |
| Parallel Fetch & Watchdog timers | XState v5 | Use XState machine with `Promise.race` + `watchdog` timer |
| Multi-Actor Retries & Back-offs | XState v5 | Use XState machine (`retrieval-machine.ts`, `chat-machine.ts`) |
