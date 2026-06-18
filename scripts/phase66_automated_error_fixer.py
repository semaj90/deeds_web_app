
#!/usr/bin/env python3
"""
Phase 66: Automated CSS/TypeScript Error Fixer (LangGraph Multi-Agent)
Uses LangGraph StateGraph + ChatOllama + Qdrant semantic retrieval.

Dependencies:
    pip install langgraph langchain-ollama langchain-core langchain-qdrant qdrant-client
    (torch already available from phase89 pipeline)

Graph topology:
    scanner → retriever → analyzer → fixer → verifier
                               ↑                  │
                               └──────────────────┘ (loop if errors remain, max --max-cycles)

Nodes:
    scanner   — run svelte-check, parse error count
    retriever — embed error summary → query Qdrant phase89_error_chunks for similar past fixes
    analyzer  — LLM plans fix_actions using Qdrant cluster context
    fixer     — execute fix_actions (node scripts / regex bulk replace)
    verifier  — re-run svelte-check, decide to loop or stop

Flags:
    --dry-run      Analyze and plan fixes but do not write files
    --max-cycles N Max fixer→verifier→analyzer loops (default 3)
    --model NAME   Override Ollama model (default gemma3-legal:latest)
    --no-qdrant    Skip Qdrant retrieval (offline mode)

LibTorch / N-API note:
    The TypeScript libtorch-bridge.ts N-API addon (tensorrt_bridge.node) is not
    callable from Python. We use `torch` directly for GPU tensor ops where needed.
    Qdrant vector similarity is handled server-side by Qdrant itself.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, StateGraph

# Optional Qdrant integration (graceful fallback if not installed)
try:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Distance, VectorParams
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False

# Optional torch for GPU cosine similarity (same lib phase89 uses)
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# ============================================================================
# Configuration
# ============================================================================

WORKSPACE_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = WORKSPACE_ROOT / "sveltekit-frontend"

# CLI args
DRY_RUN = "--dry-run" in sys.argv
MAX_CYCLES = 3
MODEL = "gemma4-legal:latest"
for i, arg in enumerate(sys.argv):
    if arg == "--max-cycles" and i + 1 < len(sys.argv):
        MAX_CYCLES = int(sys.argv[i + 1])
    if arg == "--model" and i + 1 < len(sys.argv):
        MODEL = sys.argv[i + 1]

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("PHASE89_ERROR_COLLECTION", "phase89_error_chunks")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
SKIP_QDRANT = "--no-qdrant" in sys.argv

SVELTE5_MODEL = os.getenv("SVELTE5_MODEL", "gemma4-legal-fast:latest")  # same weights, lower-latency tuning — faster for Svelte 5 pattern fixes

# Patterns that indicate Svelte 5 compliance violations (G21-G25)
SVELTE5_ERROR_PATTERNS = [
    r"export\s+let\s+\w+",          # G21: should be $props()
    r"\$:[^:]",                       # G22: should be $derived/$effect
    r"\bon:[a-z][a-z]+=",             # G23: should be onclick= etc.
    r"createEventDispatcher",          # G24: use callback props
    r"\$(?:state|derived|effect|props)\s*[(<].*\.ts",  # G25: runes in plain .ts
    r"Svelte 4",
    r"migration",
    r"on:click|on:submit|on:change|on:input",
]

KNOWN_FIXERS = {
    # Node.js fixers (CJS)
    "phase108-batch-fixer":     "scripts/phase108-batch-fixer.cjs",       # Svelte 5 runes + TS syntax batch fixer
    "fix-import-corruption":    "scripts/fix-import-corruption.cjs",      # import: {x} from: 'y' → import {x} from 'y'
    "phase74-import-fixer":     "scripts/phase74-batch-import-fixer.cjs", # import { x: x } → import { x }
    "fix-colon-corruption":     "scripts/fix-colon-corruption.cjs",       # colon-as-separator corruption in TS files
    # PowerShell fixers
    "fix-svelte5-events":       "scripts/fix-svelte5-events.ps1",         # on:click= → onclick= (Svelte 4→5)
    "fix-svelte5-all":          "scripts/fix-svelte5-all.ps1",            # Full Svelte 4→5 migration pass
}

llm = ChatOllama(model=MODEL, base_url="http://localhost:8090", temperature=0.1)
svelte5_llm = ChatOllama(model=SVELTE5_MODEL, base_url="http://localhost:11434", temperature=0.05)

print("🤖 Phase 66: Automated Error Fixer (LangGraph)")
print("=" * 60)
print(f"📁 Workspace: {WORKSPACE_ROOT}")
print(f"🧠 LLM: {MODEL}  |  Svelte5 LLM: {SVELTE5_MODEL}")
print(f"🔁 Max cycles: {MAX_CYCLES}")
print(f"{'🔍 DRY RUN — no files will be modified' if DRY_RUN else '✏️  LIVE — fixes will be applied'}")
print(f"🔎 Qdrant retrieval: {'SKIP (--no-qdrant)' if SKIP_QDRANT else QDRANT_URL + ' / ' + QDRANT_COLLECTION if QDRANT_AVAILABLE else 'UNAVAILABLE (install langchain-qdrant)'}")
print(f"⚡ Torch GPU: {'CUDA ' + str(torch.version.cuda) if TORCH_AVAILABLE and torch.cuda.is_available() else 'torch CPU' if TORCH_AVAILABLE else 'UNAVAILABLE'}")
print("=" * 60)

# ============================================================================
# State definition
# ============================================================================

class AgentState(TypedDict):
    raw_output: str       # raw svelte-check output
    error_count: int      # current error count
    initial_errors: int   # error count at start
    qdrant_context: list  # similar past error clusters from Qdrant
    analysis: str         # LLM analysis text
    fix_plan: list        # list of fix action strings returned by LLM
    fixes_applied: list   # actions actually executed
    cycle: int            # current loop iteration
    done: bool            # terminal condition


# ============================================================================
# Helpers
# ============================================================================

def run_svelte_check() -> tuple[str, int]:
    """Run svelte-check and return (raw_output, error_count)."""
    print("\n🔍 Running svelte-check...")
    ps_cmd = f'cd "{FRONTEND_DIR}"; npx svelte-check --threshold error 2>&1'
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        capture_output=True, text=True, timeout=300
    )
    output = (result.stdout or "") + (result.stderr or "")
    m = re.search(r"(\d+)\s+error", output)
    count = int(m.group(1)) if m else 0
    return output, count


def apply_fixer(fixer_name: str) -> str:
    """Run a known Node.js fixer script and return output."""
    rel_path = KNOWN_FIXERS.get(fixer_name)
    if not rel_path:
        return f"Unknown fixer: {fixer_name}"
    script = FRONTEND_DIR / rel_path
    if not script.exists():
        # Try workspace root
        script = WORKSPACE_ROOT / rel_path
    if not script.exists():
        return f"Script not found: {rel_path}"
    ext = script.suffix
    if ext == ".ps1":
        runner = "powershell"
        extra = "-DryRun" if DRY_RUN else ""
        cmd = f'cd "{FRONTEND_DIR}"; powershell -NoProfile -ExecutionPolicy Bypass -File "{script}" {extra}'
    else:
        runner = "node" if ext in (".mjs", ".cjs", ".js") else "python"
        extra = "--apply" if fixer_name == "phase108-batch-fixer" else ""
        cmd = f'cd "{FRONTEND_DIR}"; {runner} "{script}" {extra}'
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", cmd],
        capture_output=True, text=True, timeout=180
    )
    return (result.stdout or "") + (result.stderr or "")


def apply_regex_bulk(pattern: str, replacement: str, label: str) -> str:
    """Bulk regex replace across src/**/*.{svelte,ts} via PowerShell."""
    ps = f"""
cd '{FRONTEND_DIR}'
$count = 0
Get-ChildItem -Path src -Recurse -Include *.svelte,*.ts | ForEach-Object {{
    $c = Get-Content $_.FullName -Raw
    if ($c -match '{pattern}') {{
        $new = $c -replace '{pattern}', '{replacement}'
        Set-Content $_.FullName $new -NoNewline
        $count++
    }}
}}
Write-Host "Patched $count files for: {label}"
"""
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True, text=True, timeout=60
    )
    return (result.stdout or "").strip()


# ============================================================================
# LangGraph node functions
# ============================================================================

def _ollama_embed(text: str) -> list[float] | None:
    """Embed text via Ollama REST API. Returns 768-dim vector or None on failure."""
    import urllib.request, urllib.error
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text[:2000]}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()).get("embedding")
    except Exception as e:
        print(f"  ⚠️  Ollama embed failed: {e}")
        return None


GENERIC_CLUSTER_TYPES = {
    "general-ts-error",
    "Type '",
    "Expected",
    "Property '",
}


def _extract_signal_terms(text: str) -> set[str]:
    terms: set[str] = set()

    def add(candidate: str) -> None:
        cleaned = candidate.strip().strip(".,:;()[]{}")
        if len(cleaned) < 3 or len(cleaned) > 80:
            return
        if cleaned.lower() in {"type", "error", "warning", "module", "property", "object", "string", "number", "boolean", "unknown", "never"}:
            return
        terms.add(cleaned)

    for match in re.finditer(r"'([^'\n]{2,80})'|`([^`\n]{2,80})`", text):
        add(match.group(1) or match.group(2) or "")
    for match in re.finditer(r"\bTS\d{4,5}\b", text):
        add(match.group(0))
    for match in re.finditer(r"\$lib/[A-Za-z0-9_./-]+", text):
        add(match.group(0))
    for match in re.finditer(r"\b(?:[A-Z][A-Za-z0-9]+(?:\.[A-Z][A-Za-z0-9]+)*|[a-z][A-Za-z0-9]+(?:Service|Store|Panel|Editor|Response|Event|State|Embedding|Evidence|Summary|Dialog|Canvas|Case))\b", text):
        add(match.group(0))
    return terms


def retriever_node(state: AgentState) -> AgentState:
    """Embed current errors and query Qdrant phase89_error_chunks for similar past fixes."""
    print("\n━━━ [retriever] ━━━")

    if SKIP_QDRANT or not QDRANT_AVAILABLE or state["error_count"] == 0:
        reason = "no errors" if state["error_count"] == 0 else "--no-qdrant" if SKIP_QDRANT else "qdrant-client not installed"
        print(f"  Skipping Qdrant retrieval ({reason})")
        return {**state, "qdrant_context": []}

    # Build a compact error summary to embed
    error_snippet = state["raw_output"][:1500]
    query_terms = _extract_signal_terms(error_snippet)

    vec = _ollama_embed(error_snippet)
    if vec is None:
        print("  Embedding failed — continuing without Qdrant context.")
        return {**state, "qdrant_context": []}

    try:
        client = QdrantClient(url=QDRANT_URL, timeout=10)

        # GPU cosine similarity is handled server-side by Qdrant
        # (torch is available if phase89 ran, but Qdrant search is faster for retrieval)
        hits = client.query_points(
            collection_name=QDRANT_COLLECTION,
            query=vec,
            limit=8,
            with_payload=True,
        ).points

        ranked_context = []
        for hit in hits:
            payload = hit.payload or {}
            error_type = payload.get("error_type", payload.get("tag", "unknown"))
            payload_terms = {str(term) for term in payload.get("match_terms", []) if term}
            overlapping_terms = sorted(query_terms & payload_terms)
            lexical_bonus = min(len(overlapping_terms), 4) * 0.03
            specificity_bonus = 0.04 if error_type not in GENERIC_CLUSTER_TYPES else 0.0
            adjusted_score = round(float(hit.score) + lexical_bonus + specificity_bonus, 3)
            entry = {
                "score": adjusted_score,
                "vector_score": round(float(hit.score), 3),
                "cluster_id": payload.get("cluster_id", "?"),
                "error_type": error_type,
                "summary": payload.get("summary", payload.get("content", ""))[:300],
                "fix_hint": payload.get("fix_hint", payload.get("fix_action", "")),
                "match_terms": overlapping_terms[:6],
            }
            ranked_context.append(entry)

        context = sorted(
            ranked_context,
            key=lambda entry: (entry["score"], entry.get("vector_score", 0.0)),
            reverse=True,
        )[:5]

        print(f"  Found {len(context)} similar past error clusters from Qdrant")
        for c in context:
            overlap = f" terms={','.join(c['match_terms'])}" if c.get("match_terms") else ""
            print(f"    [{c['score']}] {c['error_type']}: {c['summary'][:80]}...{overlap}")

        return {**state, "qdrant_context": context}

    except Exception as e:
        print(f"  ⚠️  Qdrant query failed ({e}) — continuing without cluster context.")
        return {**state, "qdrant_context": []}


def scanner_node(state: AgentState) -> AgentState:
    """Run svelte-check and populate raw_output + error_count."""
    print("\n━━━ [scanner] ━━━")
    output, count = run_svelte_check()
    initial = state.get("initial_errors", -1)
    if initial == -1:
        initial = count
    print(f"  Errors: {count}")
    return {**state, "raw_output": output, "error_count": count, "initial_errors": initial}


def analyzer_node(state: AgentState) -> AgentState:
    """Ask the LLM to analyse errors and return a JSON fix plan."""
    print("\n━━━ [analyzer] ━━━")
    cycle = state.get("cycle", 0)
    count = state["error_count"]
    if count == 0:
        print("  No errors — skipping LLM analysis.")
        return {**state, "analysis": "No errors.", "fix_plan": [], "done": True}

    # Summarise errors for the prompt (first 6 KB)
    snippet = state["raw_output"][:6000]
    already_applied = state.get("fixes_applied", [])
    qdrant_context = state.get("qdrant_context", [])

    # Auto-select gemma4-legal for Svelte 5 violation analysis (G21-G25 patterns)
    import re as _re
    svelte5_score = sum(1 for p in SVELTE5_ERROR_PATTERNS if _re.search(p, snippet))
    use_svelte5_model = svelte5_score >= 2
    active_llm = svelte5_llm if use_svelte5_model else llm
    if use_svelte5_model:
        print(f"  Using {SVELTE5_MODEL} (Svelte 5 violations detected, score={svelte5_score})")
    else:
        print(f"  Using {MODEL}")


    # Build Qdrant cluster context block for the LLM
    context_block = ""
    if qdrant_context:
        lines = ["Similar past error clusters from Qdrant (use fix_hint if available):"]
        for c in qdrant_context:
            hint = f" → fix_hint: {c['fix_hint']}" if c.get("fix_hint") else ""
            lines.append(f"  [score={c['score']}] {c['error_type']}: {c['summary'][:150]}{hint}")
        context_block = "\n<past_clusters>\n" + "\n".join(lines) + "\n</past_clusters>\n"

    prompt = f"""You are a TypeScript/Svelte expert fixer. Here is svelte-check output with {count} errors:

<errors>
{snippet}
</errors>
{context_block}
Already applied this session: {json.dumps(already_applied)}

Respond ONLY with valid JSON, no prose:
{{
  "analysis": "<one sentence summary of dominant error type>",
  "fix_actions": [
    "run:fix-type-imports",
    "run:phase108-batch-fixer",
    "regex:<pattern>|<replacement>|<label>"
  ]
}}

Available run: keys and what they fix:
  phase108-batch-fixer     - Svelte 5 runes syntax + general TS errors
  fix-import-corruption    - import: {{x}} from: 'y' colon corruption in imports
  phase74-import-fixer     - import {{ x: x }} shorthand corruption
  fix-colon-corruption     - colon-as-separator corruption throughout TS files
  fix-svelte5-events       - on:click/on:submit etc → onclick/onsubmit (Svelte 4→5)
  fix-svelte5-all          - comprehensive Svelte 4→5 migration (events, slots, etc)

For regex actions use | as separator. Keep patterns simple (no lookaheads).
Return at most 4 fix_actions. Skip actions already applied.
If no clear automated fix exists, return an empty fix_actions list."""

    messages = [
        SystemMessage(content="You output only valid JSON. No markdown, no prose."),
        HumanMessage(content=prompt),
    ]
    response = active_llm.invoke(messages)
    raw = response.content.strip()

    # Strip markdown fences if present
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        data = json.loads(raw)
        analysis = data.get("analysis", "")
        fix_plan = data.get("fix_actions", [])
    except json.JSONDecodeError:
        print(f"  LLM returned non-JSON: {raw[:200]}")
        analysis = raw[:200]
        fix_plan = []

    print(f"  Analysis: {analysis}")
    print(f"  Fix plan ({len(fix_plan)} actions): {fix_plan}")
    return {**state, "analysis": analysis, "fix_plan": fix_plan, "cycle": cycle + 1}


def fixer_node(state: AgentState) -> AgentState:
    """Execute fix_plan actions (unless --dry-run)."""
    print("\n━━━ [fixer] ━━━")
    actions = state.get("fix_plan", [])
    applied = list(state.get("fixes_applied", []))

    if not actions:
        print("  No actions to apply.")
        return {**state, "fixes_applied": applied}

    for action in actions:
        if action in applied:
            print(f"  Skipping already-applied: {action}")
            continue

        if action.startswith("run:"):
            fixer_name = action[4:]
            if DRY_RUN:
                print(f"  [DRY-RUN] Would run fixer: {fixer_name}")
            else:
                print(f"  Running fixer: {fixer_name}")
                out = apply_fixer(fixer_name)
                print(f"  Output: {out[:300]}")
            applied.append(action)

        elif action.startswith("regex:"):
            parts = action[6:].split("|", 2)
            if len(parts) == 3:
                pattern, replacement, label = parts
                if DRY_RUN:
                    print(f"  [DRY-RUN] Would apply regex: {label}")
                else:
                    print(f"  Applying regex: {label}")
                    out = apply_regex_bulk(pattern, replacement, label)
                    print(f"  Output: {out[:200]}")
                applied.append(action)
            else:
                print(f"  Malformed regex action (need pattern|replacement|label): {action}")

        else:
            print(f"  Unknown action format: {action}")

    return {**state, "fixes_applied": applied}


def verifier_node(state: AgentState) -> AgentState:
    """Re-run svelte-check and decide whether to loop."""
    print("\n━━━ [verifier] ━━━")
    if DRY_RUN:
        print("  [DRY-RUN] Skipping re-check.")
        return {**state, "done": True}

    output, count = run_svelte_check()
    prev = state["error_count"]
    initial = state["initial_errors"]
    cycle = state.get("cycle", 0)

    improvement = prev - count
    print(f"  Errors: {count} (was {prev}, started at {initial}, Δ={improvement:+d})")

    done = (count == 0) or (cycle >= MAX_CYCLES) or (improvement <= 0 and cycle > 1)
    if done:
        pct = round((initial - count) / max(initial, 1) * 100)
        print(f"  Done. Reduced errors by {initial - count} ({pct}%)")

    return {**state, "raw_output": output, "error_count": count, "done": done}


def should_continue(state: AgentState) -> str:
    """Conditional edge: loop back to analyzer or finish."""
    if state.get("done"):
        return END
    return "analyzer"


# ============================================================================
# Build graph
# ============================================================================

graph = StateGraph(AgentState)
graph.add_node("scanner", scanner_node)
graph.add_node("retriever", retriever_node)  # Qdrant historical fix context
graph.add_node("analyzer", analyzer_node)
graph.add_node("fixer", fixer_node)
graph.add_node("verifier", verifier_node)

graph.set_entry_point("scanner")
graph.add_edge("scanner", "retriever")   # embed errors → query phase89_error_chunks
graph.add_edge("retriever", "analyzer")  # inject cluster context into LLM prompt
graph.add_edge("analyzer", "fixer")
graph.add_edge("fixer", "verifier")
graph.add_conditional_edges("verifier", should_continue, {END: END, "analyzer": "analyzer"})

app = graph.compile()


# ============================================================================
# Main
# ============================================================================

def main() -> None:
    initial_state: AgentState = {
        "raw_output": "",
        "error_count": 0,
        "initial_errors": -1,
        "analysis": "",
        "fix_plan": [],
        "fixes_applied": [],
        "cycle": 0,
        "done": False,
    }

    print("\n🚀 Starting LangGraph pipeline...\n")
    final = app.invoke(initial_state)

    print("\n" + "=" * 60)
    print("🏁 Phase 66 Complete")
    print(f"  Initial errors : {final['initial_errors']}")
    print(f"  Final errors   : {final['error_count']}")
    print(f"  Cycles run     : {final['cycle']}")
    print(f"  Actions applied: {final['fixes_applied']}")
    if DRY_RUN:
        print("  (DRY RUN — no files were modified)")
    print("=" * 60)


if __name__ == "__main__":
    main()
