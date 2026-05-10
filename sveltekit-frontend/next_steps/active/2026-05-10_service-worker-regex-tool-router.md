# Design: Service Worker + Regex Tool Router

**Date**: 2026-05-10
**Status**: DESIGN ONLY
**Target File**: `sveltekit-frontend/next_steps/active/2026-05-10_service-worker-regex-tool-router.md`

## 1. Architecture Overview

### ASCII Diagram

```text
[ Browser Main Thread ]           [ Service Worker (static/sw.js) ]
       |                                       |
       |-- (1) Event Generated ----> [ IndexedDB Queue ]
       |                                       |
       |-- (2) Offline/Buffered ----> [ Queue Storage ]
       |                                       |
       |<-- (3) Online Event ------------------|
       |                                       |
       |--------------------------> (4) Batch Flush to API
                                               |
                                     [ /api/analytics/context-timeline ]
                                               |
                                     [ Postgres (context_timeline) ]

[ AdminChatAssistant (Svelte 5 Rune) ]
       |
       |-- (1) query = "Fix schema drift in persons_of_interest"
       |
       |-- (2) intent = inferIntent(query)  // Label: "schema_drift"
       |
       |-- (3) router(intent) ----> Chain: [kag.multi_lane_search, db.inspect_schema]
       |
       |-- (4) dispatch(chain) ----> [ /api/ai/contextual-chat ]
                                               |
                                     [ MCP Tool Execution Loop ]
```

---

## 2. Service Worker: Token Offloading & Offline Sync

### IndexedDB Schema (`deeds-offline-events`)
```typescript
interface OfflineEvent {
  id: string;          // UUID
  eventType: string;   // e.g., 'chat.intent', 'panel.view'
  pipeline: string;    // e.g., 'kag', 'ui'
  payload: any;        // JSONB-compatible
  timestamp: number;   // Date.now()
  retryCount: number;  // 0-5
}
```

### Component Breakdown

1.  **`static/sw.js`**:
    *   **Skip Waiting**: Immediate activation.
    *   **No Intercept**: Explicitly skip `/api/auth/*`, `/api/ai-chat/stream`, and all SSE endpoints.
    *   **Background Sync**: Listen for `sync` event (if supported) or `online` event.
    *   **Batching**: Collect up to 50 events from IDB and POST to `/api/analytics/context-timeline`.

2.  **`src/lib/client/sw-register.ts`**:
    *   Standard `navigator.serviceWorker.register` call.
    *   Expose `pushEvent(type, payload)` helper that writes to IDB and pings SW.

### Failure Modes
*   **Stale SW**: Version mismatch during auth flow. *Mitigation: `skipWaiting()` + hard reload on 401.*
*   **IDB Bloat**: Offline for days. *Mitigation: TTL (7 days) + cap (1000 events).*
*   **Double-Flush**: Multiple tabs syncing at once. *Mitigation: IDB transaction locks or 'processing' flag per row.*

---

## 3. Regex-Based Intent Detector & Router

### Intent Detector Signatures
```typescript
type IntentLabel = 'evidence_upload' | 'schema_drift' | 'graph_search' | 'gpu_rerank' | 'ui_bug' | 'legal_research';

interface IntentResult {
  label: IntentLabel;
  confidence: number;
  keywords: string[];
}

function inferIntent(text: string): IntentResult;
```

### Routing Logic (Mapping)
| Label | Preferred MCP Operator Chain |
| :--- | :--- |
| `evidence_upload` | `ops.trust_audit` -> `kag.multi_lane_search` |
| `schema_drift` | `db.inspect_schema` -> `kag.multi_lane_search` -> `trace.explain_retrieval` |
| `legal_research` | `kag.multi_lane_search` -> `kb.extract_citations` -> `kag.feature_lookup` |
| `graph_search` | `graph.expand_neighborhood` -> `hypergraph.get_edges` |
| `ui_bug` | `search.dev_context` -> `context.get_compressed_card` |

### Svelte 5 Integration (`admin-chat-assistant.svelte.ts`)
```typescript
class AdminChatAssistant {
  // ... existing messages, isThinking ...

  async send(query: string) {
    const intent = inferIntent(query);
    
    // Log to context_timeline (SW will buffer if offline)
    sw.pushEvent('chat.intent', { 
      query, 
      label: intent.label, 
      conf: intent.confidence 
    });

    const body = {
      query,
      intent: intent.confidence > 0.5 ? intent.label : null,
      operatorChain: getChain(intent)
    };

    // ... fetch /api/ai/contextual-chat ...
  }
}
```

### Failure Modes
*   **False Positive**: "Upload" mentioned in a research query. *Mitigation: Fall through to flat `kag.multi_lane_search` if confidence < 0.5.*
*   **Chain Timeout**: Too many tools in one sequence. *Mitigation: Enforce max 3 tools per intent chain.*
*   **State Drift**: Backend operator names change. *Mitigation: Centralized `IntentRegistry` shared via types.*

---

## 4. Implementation Plan

### Phase 1: Service Worker Foundation (1 day)
*   Create `static/sw.js` with basic lifecycle and IDB boilerplate.
*   Implement `src/lib/client/sw-register.ts` and verify registration in `app.html`.
*   Unit test: Mock IDB and verify `online` event triggers a fetch.

### Phase 2: Offline Timeline Sync (1 day)
*   Implement `pushEvent` helper.
*   Update `/api/analytics/context-timeline` to handle array batches.
*   Integration test: Go offline, trigger events, go online, verify DB rows.

### Phase 3: Intent Detector (1 day)
*   Implement `inferIntent` with regex patterns for the 6 core labels.
*   Add unit tests for "noisy" queries (e.g., "I need to upload this evidence but first search for the case").
*   Integrate with `AdminChatAssistant` rune store.

### Phase 4: KAG Operator Router (1 day)
*   Create `/api/ai/contextual-chat` endpoint.
*   Implement the dispatcher that executes the MCP tool chain.
*   E2E test: Verify "schema drift" query triggers `db.inspect_schema` automatically.

## 5. Non-Goals
*   Does **NOT** replace existing `/api/admin/ai-chat` (which remains the flat fallback).
*   Does **NOT** perform server-side streaming inside the Service Worker.
*   Does **NOT** handle binary file uploads via SW background sync (restricted to JSON events).
