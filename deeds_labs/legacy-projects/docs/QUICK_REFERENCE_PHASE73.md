# Phase 73 Quick Reference Card

## 🎯 Similarity Scoring

```typescript
import { similarityBand, formatSimilarity } from '$lib/utils/similarity';

// Get band
const band = similarityBand(0.94);
// { label: 'High', color: 'text-green-500', threshold: 0.92 }

// Format
formatSimilarity(0.94); // "94.0%"

// Check if edit allowed
shouldAllowEdit(0.94, 0.92); // true
```

**Bands**:
- **High**: ≥ 0.92 (green) - Safe to edit
- **Medium**: ≥ 0.80 (amber) - Review recommended
- **Low**: < 0.80 (red) - Block or require approval

---

## 🛡️ Guardrails

```python
from backend.services.guardrails import guardrail

result = guardrail.check(
    tool_name="rewrite_file",
    tool_args={"path": "src/routes/login/+page.svelte"},
    last_rag_result={"score": 0.89},
    context={"route_path": "/login"}
)

if not result.allowed:
    print(f"❌ {result.reason}")
    print(f"Score: {result.score:.3f} (need {result.threshold:.3f})")
```

**Write Tools** (require check):
- `rewrite_file`, `create_file`, `apply_patch`
- `run_svelte_check_fix`, `cluster_errors_apply`
- `apply_ts_morph_fix`, `apply_codemod`
- `ace_execute_action`

**Production Routes** (higher threshold 0.95):
- `/login`, `/dashboard`, `/cases`, `/evidence`
- `/ai-chat`, `/command-center`, `/evidence-board`

---

## 🔧 Tool Names

```python
# Both work (alias → canonical)
tool_router.execute("get_document_chunks", {...})      # FastMCP style
tool_router.execute("minio_get_chunks", {...})         # Canonical

# All aliases
"get_document_chunks" → "minio_get_chunks"
"get_case_evidence_metadata" → "minio_get_evidence"
"search_legal_documents" → "ace_rag_search"
"query_knowledge_graph" → "ace_kag_search"
"analyze_document_with_gemma" → "ace_analyze_with_gemma"
```

---

## 🎨 Demo vs Prod

```typescript
// In Graph API
interface GraphNode {
    kind: 'prod' | 'demo';  // NEW!
}

// Classification rules
const isProdRoute = (url: string) => {
    const prodPaths = ['/login', '/dashboard', '/cases', '/evidence'];
    const demoPaths = ['/lab', '/dev', '/test', '/graph-mode'];
    // ...
};
```

**Production**: `/login`, `/dashboard`, `/cases`, `/evidence`, `/ai-chat`
**Demo/Lab**: `/lab/*`, `/dev/*`, `/graph-mode`, `/ast-graph`

---

## 🎮 Pokémon Modal

```svelte
<script>
  import RouteHelpDialog from './RouteHelpDialog.svelte';
  let helpOpen = false;
</script>

<button class="nes-btn nes-btn-primary" on:click={() => helpOpen = true}>
  ❓ What goes where?
</button>

<RouteHelpDialog bind:open={helpOpen} />
```

**UnoCSS Classes**:
- `pkmn-water-frame` - Watercolor RGB border
- `pkmn-water-inner` - NES panel inside
- `pkmn-modal-header` - Modal header
- `pkmn-modal-body` - Modal body
- `pkmn-modal-grid` - 3-column grid

---

## 🚀 Quick Commands

```bash
# Start with QUIC + GPU + SIMD
npm run dev:quic:full

# Start MinIO SIMD only
npm run simd:exe:start

# Test guardrails
python -m backend.services.guardrails

# Check similarity scores
curl http://localhost:8000/api/rag/search \
  -d '{"query": "contract law"}' | jq '.hits[].score'
```

---

## 📊 Response Formats

### RAG/KAG Search
```json
{
  "hits": [
    {
      "text": "...",
      "score": 0.94,
      "rank": 0,
      "source": "rag",
      "metadata": {...}
    }
  ]
}
```

### ACE Execution (Blocked)
```json
{
  "success": false,
  "blocked_by_guardrail": true,
  "reason": "Similarity 0.850 < 0.920; requires human approval",
  "similarity_score": 0.850,
  "similarity_threshold": 0.920,
  "similarity_band": "Medium",
  "tool": "rewrite_file",
  "suggestion": "Please confirm context or refine your request"
}
```

### ACE Execution (Success)
```json
{
  "success": true,
  "result": {...},
  "similarity_score": 0.94,
  "similarity_band": "High",
  "tool": "minio_get_chunks"
}
```

---

## 🎯 Integration Checklist

- [ ] Import `similarity.ts` utilities in UI components
- [ ] Show similarity bands on RAG/KAG results
- [ ] Check guardrails before ACE execution
- [ ] Tag routes as `prod` or `demo` in Graph API
- [ ] Add help modal to Command Center
- [ ] Use canonical tool names in backend
- [ ] Support FastMCP aliases in MCP server
- [ ] Test with `ACE_MODE=prod` and `ACE_MODE=demo`

---

## 🔗 Key Files

| File | Purpose |
|------|---------|
| `sveltekit-frontend/src/lib/utils/similarity.ts` | Similarity utilities |
| `backend/services/guardrails.py` | Guardrail system |
| `backend/services/ace_orchestrator.py` | ACE with guardrails |
| `backend/services/tool_router.py` | Tool registry + aliases |
| `sveltekit-frontend/src/routes/api/graph/data/+server.ts` | Graph API with demo/prod |
| `sveltekit-frontend/src/routes/graph-mode/+page.svelte` | Graph Mode with filtering |
| `sveltekit-frontend/src/routes/command/routes/RouteHelpDialog.svelte` | Pokémon modal |
| `sveltekit-frontend/uno.config.ts` | UnoCSS with Pokémon shortcuts |

---

## 💡 Pro Tips

1. **Tune thresholds**: Adjust `SIMILARITY_THRESHOLD` based on your use case
2. **Demo mode**: Use `ACE_MODE=demo` for demos/testing (bypasses guardrails)
3. **Visual feedback**: Always show similarity bands in UI for transparency
4. **Production safety**: Keep `PROD_ROUTE_THRESHOLD=0.95` for critical routes
5. **Tool aliases**: Use FastMCP-style names in docs, canonical names in code
6. **Graph filtering**: Use demo/prod filter to focus on relevant routes
7. **Help modal**: Add to any complex UI for onboarding

---

**Phase 73**: ✅ Complete
**All 42 Features**: ✅ Integrated
**Production Ready**: ✅ Yes
