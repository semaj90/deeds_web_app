# Client-Side Inference & Worker Policy

> Settles three recurring questions:
>   1. Does the Service Worker proxy to backend?
>   2. Should we use Nico Martin's Transformers.js Chrome extension (Gemma4 ONNX in browser)?
>   3. Where does Gemma4 actually run on RTX 3060 Ti vs in the operator's browser?

## Service Worker vs Web Worker — different jobs, do not collapse

| Worker | Job | Backend involvement |
|--------|-----|---------------------|
| **Web Worker** (`browser-context-embed.worker.ts`) | CPU/GPU work off the main thread: Transformers.js feature-extraction, JSON canonicalization, Fuse.js index, ZIP packing | Direct `fetch()` to backend allowed — runs in a normal worker context |
| **OffscreenCanvas + Worker** | The WebGPU render loop itself when scene > ~5k draw calls | None — pure GPU rendering |
| **Service Worker** | Static-asset cache + offline-first scene-export bundles + background notifications | **NO. Service Worker MUST NOT proxy to the SvelteKit backend.** |

### Why the Service Worker does not proxy to backend

Three failure modes you avoid by keeping the SW out of the chat path:

1. **Streaming SSE breaks.** The SW's `fetch` interception buffers responses. Our chat endpoint streams tokens via SSE — wrapping it in SW caching turns a real-time stream into a single 25s blocking response.
2. **Auth cookies get out of sync.** SW runs in its own scope; cookie refresh during a long chat session may miss the SW context, causing 401 storms after 30+ minutes.
3. **Cache invalidation is wrong shape.** Backend responses are personalized (user, session, browser-context snapshot) — the SW's URL-keyed cache would either serve stale results to other users (security bug) or never hit (pointless overhead).

**SW is for** static `.glb`/`.wasm` assets, the offline scene-export bundle's own `index.html`, and notification fan-out. Backend chat goes via **direct `fetch()` from the main thread or a Web Worker**, never through the SW cache layer.

## Nico Martin Transformers.js + Gemma extension — verdict

Nico Martin (`nico.dev`, `web2026`) shipped a Chrome extension demonstrating Transformers.js v3 + WebGPU running Gemma 2 / Phi-3 / similar small ONNX models entirely in the browser. **Real, works, ships actual ONNX weights to disk.**

For our use case:

| Question | Answer |
|----------|--------|
| Use it as the default chat brain? | **No.** Gemma4-class weights are ~3-5GB, take 60-120s to download on first use, and Gemma4-legal-vlm requires a fine-tune we haven't released for ONNX. The TurboQuant `:8090` server-side path is faster (5-25s end-to-end with prompt cache) and uses our actual fine-tuned model. |
| Use it as an opt-in fallback? | **Yes — Phase 2 toggle.** When the operator is air-gapped (offline scene-export viewer) or wants a privacy-first lane, a local ONNX model is the only choice. |
| What model to ship in that toggle? | **Not Gemma4 (too big).** A small instruct model — `Xenova/Phi-3-mini-4k-instruct-onnx-web` (~2.4 GB) or `Xenova/gemma-2b-it` (~1.6 GB Q4). Both run on WebGPU at 10-30 tok/s on the operator's RTX 3060 Ti. |
| Should we adopt the extension itself? | **No.** Take the architecture (Transformers.js + WebGPU + ONNX), not the extension package. We ship the worker + UI ourselves so we control the trust boundary, sanitizer, and download UX. |

### Recommended toggle (NOT implemented yet — Phase 2)

```
Settings → AI Assistant
  ┌───────────────────────────────────────────────┐
  │ Inference path                                │
  │  ◉ Server (TurboQuant :8090)  ← default       │
  │  ○ Local browser (ONNX + WebGPU)              │
  │     ⚠ requires 2.4 GB one-time download       │
  │     [ Download Phi-3-mini ] [ Download Gemma 2B ] │
  │     Downloaded models cached in IndexedDB.    │
  └───────────────────────────────────────────────┘
```

**Trust model**: a downloaded local model is *more* trusted than the
browser-context lane (no network round-trip = no MITM surface) but
*less* trusted than the server fine-tune (server has the legal LoRA;
browser has only the base instruct weights). Make the trust label
explicit in the popup footer when local-mode is on.

## Where Gemma4 actually runs today

```
Operator's RTX 3060 Ti (8 GB VRAM)
  └─ TurboQuant llama-server :8090 (gemma4-legal-vlm Q4_K_M, 5.3 GB)
        ↑
        │   /v1/chat/completions (HTTP, server-side)
        │
SvelteKit /api/admin/ai-chat → bifrostChat() → server-side fetch
        ↑
        │   POST /api/admin/ai-chat
        │
Browser → main-thread fetch (NOT through Service Worker)
```

```
Operator's CPU/iGPU/WebGPU (browser)
  └─ Transformers.js @huggingface/transformers 4.2.0
        ├─ feature-extraction worker — Xenova/all-MiniLM-L6-v2 (90 MB)
        │     used by: browser-context-embed.worker.ts (history reranking)
        │     status:  shipped, opt-in via the browser-context lane
        │
        └─ instruct generation (Phase 2 — not shipped)
              candidate models: Phi-3-mini, Gemma 2B
              location:         IndexedDB cache after first download
              trigger:          settings toggle + explicit operator consent
```

## Decision matrix — which inference path

| Scenario | Path | Reason |
|----------|------|--------|
| Admin chat (Copilot panel, panel summary) | **Server** Gemma4-legal-vlm | Has the legal fine-tune; sub-30s cold + 5ms cached |
| Browser-history reranking / snippet scoring | **Browser** Transformers.js feature-extraction | Tiny (90 MB), runs in worker, never leaves device |
| Operator on a plane / air-gapped review | **Browser** ONNX (Phase 2 toggle) | No network; trade fine-tune accuracy for connectivity |
| Bulk indexing / embedding pipelines | **Server** Ollama embeddinggemma | GPU batch-friendly; ~5ms per chunk warm |
| WebGPU scene reducer / canvas physics | **Browser** WebGPU + Wasm | Latency-critical; can't survive a server round-trip |

## What this commit does NOT do

- ✗ Add a Service Worker (none in repo today; the offline scene-export bundle in NEXT-SESSION-TODO Priority-3 #9 will need one — that's the right place)
- ✗ Implement the Phi-3 / Gemma 2B browser-side download toggle (Phase 2 — needs IndexedDB cache, download UI, model integrity check, settings page)
- ✗ Adopt or vendor Nico Martin's extension code (architectural reference only)
- ✗ Change anything about the existing TurboQuant / Bifrost server-side path

## What's next on the client-inference roadmap

| Phase | Deliverable | Trigger |
|-------|-------------|---------|
| Phase 1 (DONE) | Browser-context lane + feature-extraction worker | Already shipped |
| Phase 2 | Settings toggle + Phi-3 / Gemma 2B IndexedDB download flow | Operator demand for offline / air-gapped chat |
| Phase 3 | Service Worker for offline scene-export bundle (NEXT-SESSION-TODO #9) | Detective-mode reconstruction Phase 6 ships |
| Phase 4 (deferred) | OffscreenCanvas + Worker for the scene render loop | Scene exceeds ~5k draw calls in real cases |

## Verification — current SW / WW state

```bash
# No service workers should be registered in dev today.
grep -rln "navigator.serviceWorker.register" sveltekit-frontend/src 2>&1 | head
#   → expected: empty

# Web worker is the browser-context-embed worker only.
ls sveltekit-frontend/src/lib/workers/ 2>&1
#   → browser-context-embed.worker.ts

# Transformers.js dependency present.
node -e "console.log(require('./sveltekit-frontend/package.json').dependencies['@huggingface/transformers'])"
#   → "4.2.0"
```
