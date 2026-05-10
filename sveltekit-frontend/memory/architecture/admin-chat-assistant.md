# Admin Chat Assistant — ChatGPT-style Copilot for the Admin Panel

> Builds on the Browser Context Lane (`browser-context-lane.md`). Adds a
> rune-module store + reusable popup so any admin panel can trigger an
> on-demand AI analysis of its own state and have it persisted into the
> active chat session.

## Pieces

| Piece | Path | Role |
|------|------|------|
| Store (rune module) | `src/lib/stores/admin-chat-assistant.svelte.ts` | Singleton `adminChat`. Holds chat messages + per-panel summary slots. Wraps the chat + panel-summary endpoints. |
| Popup component | `src/lib/components/admin/AiAnalysisPopup.svelte` | Mounted ONCE at the layout root. Renders the active panel summary with style swap, re-analyze, copy, push-to-chat, close. |
| Trigger button | `src/lib/components/admin/SummarizeButton.svelte` | Drop-in `<SummarizeButton panelId panelTitle content />` for any panel. |
| Existing chat | `src/lib/components/admin/TraceCopilotPanel.svelte` | The bottom-right floating chat. Now also picks up the browser-context indicator. |
| Backend chat | `POST /api/admin/ai-chat` | Bifrost-cascaded Gemma4. Now passes `userId` to `gatherAdminContext` + injects `formatBrowserContextForPrompt(...)` under an explicit "untrusted user-visible" header. |
| Backend summary | `POST /api/admin/ai-chat/summarize-panel` | Single-shot panel-summary endpoint. Style hint: `brief / detailed / risk / next-step`. Optional `sessionId` to log the result into the chat thread. |

## Flow — operator clicks "Analyze" on a panel

```
SummarizeButton (panel emits its own state)
  → adminChat.summarizePanel({ panelId, panelTitle, content, style })
  → POST /api/admin/ai-chat/summarize-panel
    → Zod validate + auth check
    → Gemma4 via Bifrost (one shot, no agent loop)
    → optional log into admin_ai_chat_messages with metadata.kind='panel_summary'
  → reactive PanelSummaryResult slot updated in store
AiAnalysisPopup (mounted at layout root) reads the active slot reactively
  → renders summary + style tabs + copy/re-analyze/push-to-chat/close
```

## Layout-root mount — do this once per admin layout

```svelte
<!-- src/routes/(app)/admin/+layout.svelte -->
<script lang="ts">
  import AiAnalysisPopup from '$lib/components/admin/AiAnalysisPopup.svelte';
  import TraceCopilotPanel from '$lib/components/admin/TraceCopilotPanel.svelte';
  let { children } = $props();
</script>

{@render children()}

<!-- One popup serves every admin panel — singleton pattern -->
<AiAnalysisPopup />

<!-- Bottom-right floating chat, also a singleton -->
<TraceCopilotPanel />
```

## Per-panel usage — drop the button anywhere

```svelte
<!-- e.g. src/routes/(app)/admin/unified-indexing-studio/RerankerHealthCard.svelte -->
<script lang="ts">
  import SummarizeButton from '$lib/components/admin/SummarizeButton.svelte';

  let healthSnapshot = $derived({
    port: 8090,
    healthy: rerankHealth.ok,
    lastError: rerankHealth.error,
    queueLen: rerankHealth.pending,
    p95Latency: rerankHealth.p95,
  });
</script>

<header class="flex items-center justify-between">
  <h3>Reranker Health</h3>
  <SummarizeButton
    panelId="reranker-health"
    panelTitle="Reranker Health"
    content={healthSnapshot}
    style="risk"
    persistToChat={false}
  />
</header>
```

The button shows a 1-line spinner while Gemma4 is running. The popup
auto-opens with the result. Operator can swap style (risk → next-step
→ detailed → brief), re-analyze (after panel state changed), copy the
text, or push it into the chat thread for later reference.

## Programmatic triggering — from a chat tool / keyboard shortcut

```ts
import { adminChat } from '$lib/stores/admin-chat-assistant.svelte.js';

// From a keyboard shortcut, MCP tool callback, etc.
await adminChat.summarizePanel({
  panelId: 'cluster-table',
  panelTitle: 'GPU Cluster Table',
  content: { rows: clusterRows, sortedBy: 'pageRank' },
  style: 'next-step',
  persistToChat: true,
});
```

## Reactive store API

```ts
class AdminChatAssistant {
  // chat
  messages:    ChatMessage[];      // $state
  sessionId:   string | null;       // $state
  contextTag:  string;              // $state — 'global' / 'indexing' / etc.
  isThinking:  boolean;             // $state
  lastError:   string | null;       // $state
  hasSession:  boolean;             // $derived

  // panel summaries (one slot per panelId)
  summaries:        Record<string, PanelSummaryResult>;  // $state
  activePanelId:    string | null;                       // $state — popup focuses this
  pendingSummaries: number;                              // $derived — count of in-flight

  // chat lane
  loadSessions():        Promise<void>;
  loadHistory(id):       Promise<void>;
  send(query, ui?):      Promise<void>;
  clearChat():           void;

  // panel lane
  summarizePanel(spec):  Promise<PanelSummaryResult>;
  closeSummary(id):      void;
}

export const adminChat = new AdminChatAssistant();
```

## Hard rules (mirror Browser Context Lane)

- ✗ No DB writes apart from the optional `admin_ai_chat_messages` log row when `persistToChat: true`.
- ✗ No tool calls, no MCP fan-out, no agent loop in the panel-summary path. Single Gemma4 call.
- ✗ No streaming for the panel summary (chat already streams; popup is a one-shot brief).
- ✗ The popup never mutates panel state. Operator copies/forwards manually.
- ✗ The summarize prompt contains the explicit instruction "Do NOT propose database writes, schema changes, or destructive actions."
- ✗ The popup's footer line `untrusted-ui-snapshot · TRACE backend authoritative` is a load-bearing trust hint — do not remove.

## Failure modes

| Failure | Behavior |
|---------|----------|
| Bifrost down | `{ ok: false, error: 'Bifrost HTTP 5xx' }`, popup shows red error block, no DB writes |
| Schema-invalid spec | 400 from Zod — `<SummarizeButton>` swallows + popup shows the message |
| Auth missing | 401 — store sets `lastError`, popup shows "analysis failed" |
| Logging to chat fails | swallowed — the user-facing summary still returns successfully |
| Persisted summary push to chat with no active session | logged metadata only; `messages` array still gets the visual append |

## Verification

```bash
# Pure-function regression — sanitizer logic
npm run smoke:browser-context     # 16/16 should pass

# Once dev server up — full popup round-trip
npm run dev
# In browser: visit /admin/unified-indexing-studio, click any SummarizeButton.
# Expected: popup opens with "Analyzing…" → Gemma4 reply → style tabs work.
```

## Files added/edited this session

| File | Status |
|------|--------|
| `src/lib/stores/admin-chat-assistant.svelte.ts` | NEW — rune module |
| `src/lib/components/admin/AiAnalysisPopup.svelte` | NEW — singleton popup |
| `src/lib/components/admin/SummarizeButton.svelte` | NEW — drop-in trigger |
| `src/routes/api/admin/ai-chat/summarize-panel/+server.ts` | NEW — Gemma4 endpoint |
| `src/routes/api/admin/ai-chat/+server.ts` | EDIT — pass userId, inject browser-context section |
| `memory/architecture/admin-chat-assistant.md` | THIS FILE |

## What's deliberately NOT in this commit

- Layout-root mount of `<AiAnalysisPopup />` — the doc shows the snippet but the existing admin `+layout.svelte` is left untouched so the operator chooses where to mount.
- Any specific panel wiring `<SummarizeButton>` — those are panel-by-panel decisions; the store is ready when each one wants to opt in.
- Streaming for the panel summary endpoint — single-shot is the right shape for "summarize this panel state once". Chat already streams.
- LangGraph orchestration — keeping this lane single-shot reserves agent loops for the existing chat path.
