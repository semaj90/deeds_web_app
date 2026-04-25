# ACE Wiring Checklist

**Status**: ACE orchestrator + ToolRouter + KnowledgeStore created and wired into Phase72 API.

This checklist guides you through getting ACE live and operational.

---

## Phase 1: Verify Backend + CLI (30 min)

### 1.1 Start Backend
```bash
cd C:\Users\james\Videos\deeds-web-app
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

**Verify:**
- [ ] Backend starts without errors
- [ ] `/docs` is accessible at http://localhost:8000/docs
- [ ] `/api/phase72/next_step` endpoint is listed

### 1.2 Verify Redis
```bash
redis-cli ping
```

**Expected output:**
```
PONG
```

**Verify:**
- [ ] Redis responds with PONG

### 1.3 Test CLI with ACE
```bash
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
```

**Expected output:**
```
🤖 YoRHa Agent - Phase 72 AST Error Reduction
   Session: phase72:deeds-web-app:main
   Message: what should I fix next?
   Backend: http://localhost:8000

✅ Agent Response:

🎯 ACTION: run_svelte_check
   (or another tool name from ToolRouter)

💭 REASONING:
We need fresh error counts before clustering...

🔗 ACA Marker: [[ACA72:phase72:deeds-web-app:main:s1:p1]]
📊 Summary v1, Spec v1
```

**Verify:**
- [ ] CLI connects to backend
- [ ] Backend returns a tool name (not just "unknown")
- [ ] ACA marker is shown
- [ ] No errors in backend logs

---

## Phase 2: Wire Real Signals (1 hour)

### 2.1 Create svelte-check wrapper script
Create: `tools/run-svelte-check-phase72.mjs`

```javascript
#!/usr/bin/env node
/**
 * Run svelte-check and post results to Phase72 timeline.
 */

import { execSync } from 'child_process';
import fetch from 'node-fetch';

const BASE_URL = process.env.YORHA_BACKEND_URL ?? 'http://localhost:8000';
const SESSION_ID = process.env.SESSION_ID ?? 'phase72:deeds-web-app:main';

async function runSvelteCheck() {
  console.log('🔍 Running svelte-check...');

  try {
    const output = execSync('npx svelte-check --output json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const errors = JSON.parse(output);
    const totalErrors = errors.length;

    // Count by error code
    const byCode = {};
    errors.forEach(err => {
      const code = err.code || 'unknown';
      byCode[code] = (byCode[code] || 0) + 1;
    });

    console.log(`✅ Found ${totalErrors} errors`);
    console.log('   By code:', byCode);

    // Post to Phase72 timeline
    const res = await fetch(`${BASE_URL}/api/phase72/record_event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: SESSION_ID,
        kind: 'svelte-check',
        payload: {
          total_errors: totalErrors,
          by_code: byCode,
        },
        description: `Ran svelte-check: ${totalErrors} errors`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to record event: ${res.status}`);
    }

    console.log('📝 Recorded to Phase72 timeline');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runSvelteCheck();
```

**Verify:**
- [ ] Script runs without errors
- [ ] Outputs error count and breakdown
- [ ] Posts to `/api/phase72/record_event` successfully

### 2.2 Run svelte-check wrapper
```bash
SESSION_ID="phase72:deeds-web-app:main" node tools/run-svelte-check-phase72.mjs
```

**Expected output:**
```
🔍 Running svelte-check...
✅ Found 81234 errors
   By code: { ts1005: 1234, ts2307: 5000, ... }
📝 Recorded to Phase72 timeline
```

**Verify:**
- [ ] Script completes successfully
- [ ] Error counts are realistic
- [ ] Timeline event is recorded

### 2.3 Ask ACE what to do next (with real signals)
```bash
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
```

**Expected output:**
```
🎯 ACTION: cluster_errors
   (or another tool that makes sense given the error counts)

💭 REASONING:
Current error count: 81,234 (down from ~81,000).
Clusters addressed: none yet.
Pending: TS1005, TS2307, TS2339...
Next, we should cluster the TS1005 errors to find patterns.
```

**Verify:**
- [ ] ACE's reasoning mentions the error counts from svelte-check
- [ ] Suggested tool is contextual (e.g., cluster_errors, not random)
- [ ] ACA summary includes timeline events

---

## Phase 3: Wire Tools (1-2 hours)

### 3.1 Implement `run_svelte_check` tool
In `backend/services/tool_router.py`, replace the stub:

```python
@router.register
def run_svelte_check(args: Dict[str, Any]) -> Dict[str, Any]:
    """Run svelte-check and return aggregated error stats."""
    session_id = args.get("session_id", "")

    # Call the wrapper script or directly run svelte-check
    try:
        output = subprocess.check_output(
            ['npx', 'svelte-check', '--output', 'json'],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=60,
        )
        errors = json.loads(output)
        total = len(errors)
        by_code = {}
        for err in errors:
            code = err.get('code', 'unknown')
            by_code[code] = by_code.get(code, 0) + 1

        return {
            "errors_total": total,
            "by_code": by_code,
            "session_id": session_id,
        }
    except Exception as e:
        return {"error": str(e), "session_id": session_id}
```

**Verify:**
- [ ] Tool is registered in ToolRouter
- [ ] Can be called via `/api/tools/call`

### 3.2 Implement `cluster_errors` tool
In `backend/services/tool_router.py`:

```python
@router.register
def cluster_errors(args: Dict[str, Any]) -> Dict[str, Any]:
    """Cluster TypeScript errors using DBSCAN."""
    session_id = args.get("session_id", "")
    error_code = args.get("error_code", "ts1005")

    # TODO: call DBSCAN clustering service
    # For now, stub with realistic data
    return {
        "clusters": [
            {"id": "c1", "size": 234, "centroid": "missing-type-annotation"},
            {"id": "c2", "size": 156, "centroid": "unused-variable"},
        ],
        "session_id": session_id,
        "error_code": error_code,
    }
```

**Verify:**
- [ ] Tool returns cluster data
- [ ] Can be called via `/api/tools/call`

### 3.3 Test tool calling via CLI
```bash
# Ask ACE to run a tool
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "run svelte-check and tell me what to do"

# Or directly call a tool
curl -X POST http://localhost:8000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "run_svelte_check", "args": {"session_id": "phase72:deeds-web-app:main"}}'
```

**Expected output:**
```json
{
  "name": "run_svelte_check",
  "result": {
    "errors_total": 81234,
    "by_code": {"ts1005": 1234, "ts2307": 5000},
    "session_id": "phase72:deeds-web-app:main"
  }
}
```

**Verify:**
- [ ] Tool is callable via `/api/tools/call`
- [ ] Returns realistic data
- [ ] No errors in backend logs

---

## Phase 4: Add CHR97 Integration (1 hour)

### 4.1 Export a CHR97 cartridge
```bash
python backend/services/chr97_exporter.py \
  --session_id "phase72:deeds-web-app:main" \
  --output_dir "static/topology"
```

**Expected output:**
```
✅ Exported cartridge: phase72_deeds_main.chr97
✅ JSON sidecar: phase72_deeds_main.chr97.json
```

**Verify:**
- [ ] Cartridge file is created
- [ ] JSON sidecar is created
- [ ] Files are accessible at `/static/topology/`

### 4.2 Wire CHR97 into Svelte UI
In `sveltekit-frontend/src/routes/phase72-chat/+page.svelte`:

```svelte
<script>
  import MemoryPalaceScene from '$lib/components/MemoryPalaceScene.svelte';

  let cartridgeUrl = '/topology/phase72_deeds_main.chr97.json';
</script>

<MemoryPalaceScene {cartridgeUrl} />
```

**Verify:**
- [ ] Svelte component loads without errors
- [ ] CHR97 point cloud renders
- [ ] Search → highlight works

---

## Phase 5: Add Context Confirmation Modal (1 hour)

### 5.1 Create ContextConfirmModal.svelte
Create: `sveltekit-frontend/src/lib/components/ContextConfirmModal.svelte`

```svelte
<script>
  import { onMount } from 'svelte';

  export let isOpen = false;
  export let candidate = null;
  export let onConfirm = () => {};
  export let onReject = () => {};

  async function handleConfirm() {
    await fetch('/api/phase72/context_feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: candidate.session_id,
        context_id: candidate.context_id,
        accepted: true,
      }),
    });
    onConfirm();
  }

  async function handleReject() {
    await fetch('/api/phase72/context_feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: candidate.session_id,
        context_id: candidate.context_id,
        accepted: false,
      }),
    });
    onReject();
  }
</script>

{#if isOpen && candidate}
  <div class="modal">
    <div class="modal-content">
      <h3>Is this the one you meant?</h3>
      <div class="snippet">
        {candidate.snippet}
      </div>
      <div class="meta">
        <span>Match: {(candidate.score * 100).toFixed(1)}%</span>
        {#if candidate.timestamp}
          <span>Time: {new Date(candidate.timestamp).toLocaleString()}</span>
        {/if}
      </div>
      <div class="buttons">
        <button on:click={handleConfirm}>Yes</button>
        <button on:click={handleReject}>No</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    max-width: 600px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .snippet {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    margin: 1rem 0;
    font-family: monospace;
    font-size: 0.9rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: #666;
    margin: 1rem 0;
  }

  .buttons {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  button:first-child {
    background: #4CAF50;
    color: white;
  }

  button:last-child {
    background: #f44336;
    color: white;
  }
</style>
```

**Verify:**
- [ ] Component compiles without errors
- [ ] Modal displays when `isOpen=true`
- [ ] Buttons send feedback to backend

### 5.2 Wire modal into chat page
In `sveltekit-frontend/src/routes/phase72-chat/+page.svelte`:

```svelte
<script>
  import ContextConfirmModal from '$lib/components/ContextConfirmModal.svelte';

  let showContextModal = false;
  let contextCandidate = null;

  async function handleAgentResponse(response) {
    if (response.mode === 'confirm_context') {
      contextCandidate = response.candidate_context;
      showContextModal = true;
    }
  }
</script>

<ContextConfirmModal
  isOpen={showContextModal}
  candidate={contextCandidate}
  onConfirm={() => { showContextModal = false; }}
  onReject={() => { showContextModal = false; }}
/>
```

**Verify:**
- [ ] Modal appears when agent needs context confirmation
- [ ] Feedback is sent to backend
- [ ] Modal closes after user responds

---

## Phase 6: Wire Gemma3 Chat (1-2 hours)

### 6.1 Create `/api/chat/prosecutor` endpoint
In `backend/api/phase72_agent_api.py`:

```python
class ChatRequest(BaseModel):
    session_id: str
    role: str  # "prosecutor", "warden", "admin"
    message: str

class ChatResponse(BaseModel):
    session_id: str
    role: str
    response: str
    tool: Optional[str] = None
    tool_args: Optional[dict] = None

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """Chat endpoint with ACA + ACE integration."""
    try:
        # Log user message
        knowledge_store.log_chat(req.session_id, "user", req.message)

        # Use ACE to plan next action
        ace_result = ace.plan_next_action(
            session_id=req.session_id,
            default_goal="Assist prosecutor/warden with legal AI system",
            role=req.role,
            user_message=req.message,
            auto_execute_tool=False,
        )

        # Build response
        response_text = f"{ace_result['reason']}\n\nSuggested action: {ace_result['tool']}"

        # Log assistant response
        knowledge_store.log_chat(req.session_id, "assistant", response_text)

        return ChatResponse(
            session_id=req.session_id,
            role=req.role,
            response=response_text,
            tool=ace_result["tool"],
            tool_args=ace_result["args"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Verify:**
- [ ] Endpoint is accessible at `/api/chat`
- [ ] Returns chat response + suggested tool
- [ ] Messages are logged to timeline

### 6.2 Wire chat into Svelte UI
In `sveltekit-frontend/src/routes/phase72-chat/+page.svelte`:

```svelte
<script>
  async function sendMessage() {
    const response = await fetch('/api/phase72/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'phase72:deeds-web-app:main',
        role: 'prosecutor',
        message: userMessage,
      }),
    });

    const data = await response.json();
    messages.push({ role: 'assistant', content: data.response });

    if (data.tool && data.tool !== 'none') {
      showToolConfirmation(data.tool, data.tool_args);
    }
  }
</script>
```

**Verify:**
- [ ] Chat messages are sent and received
- [ ] Agent responses are displayed
- [ ] Tool suggestions are shown

---

## Phase 7: Multimodal Fallback (Optional, 1-2 hours)

### 7.1 Implement `analyze_multimodal_evidence` tool
In `backend/services/tool_router.py`:

```python
@router.register
def analyze_multimodal_evidence(args: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze evidence (image + text) with VLM + RAG + KAG fallback."""
    doc_id = args.get("doc_id", "")
    image_path = args.get("image_path")
    text_content = args.get("text_content")
    session_id = args.get("session_id", "")

    # Call ACE's multimodal analysis
    result = ace.analyze_multimodal_evidence(
        session_id=session_id,
        doc_id=doc_id,
        image_path=image_path,
        text_content=text_content,
    )

    return result
```

**Verify:**
- [ ] Tool is registered
- [ ] Can be called via `/api/tools/call`
- [ ] Returns multimodal analysis results

---

## Final Verification Checklist

- [ ] Backend runs without errors
- [ ] Redis is accessible
- [ ] CLI connects to backend
- [ ] ACE returns tool names (not generic actions)
- [ ] svelte-check wrapper posts to timeline
- [ ] ACE's reasoning includes real error counts
- [ ] Tools can be called via `/api/tools/call`
- [ ] CHR97 cartridge is exported and renders
- [ ] Context confirmation modal works
- [ ] Chat endpoint returns responses
- [ ] Messages are logged to timeline
- [ ] ACA summaries include timeline events

---

## Next Steps After Verification

1. **Optimize tool implementations** - Replace stubs with real implementations
2. **Add more tools** - Implement AST analysis, patch generation, etc.
3. **Wire up backends** - Connect Qdrant, Neo4j, MinIO, CHR97 gRPC
4. **Add role-based access control** - Restrict tools by role
5. **Build UI for tool execution** - Show "Run tool?" confirmations
6. **Add performance monitoring** - Track tool execution times, success rates
7. **Implement SOM / latent markers** - Optimize topology visualization

---

## Troubleshooting

### Backend won't start
- Check Python version: `python --version` (should be 3.10+)
- Check imports: `python -c "from backend.api.main import app"`
- Check Redis: `redis-cli ping`

### CLI can't connect to backend
- Check backend is running: `curl http://localhost:8000/docs`
- Check firewall: `netstat -an | grep 8000`
- Check environment: `echo $YORHA_BACKEND_URL`

### Tools not registered
- Check ToolRouter initialization in `phase72_agent_api.py`
- Check tool functions have `@router.register` decorator
- Check tool names match expected format

### ACE returns "none" tool
- Check LLM output parsing in `ace_orchestrator.py`
- Check tool list is being formatted correctly
- Check LLM is returning TOOL: / ARGS: / REASON: format

---

**Status**: Ready to execute Phase 1-7 in order.
