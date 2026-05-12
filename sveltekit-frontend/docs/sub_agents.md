# Sub-Agents Architecture & Routing — Deeds Web App

The system utilizes a **Supervisor-Routed Multi-Agent Architecture**. This pattern decomposes a broad 32-tool flat pool into focused, domain-specific sub-agents to reduce hallucination and improve tool-selection accuracy.

## 1. Sub-Agent Domains

| Sub-Agent | Specialty | Core Tools |
|-----------|-----------|------------|
| **Audio** | Transcription & Speaker Analysis | `whisper_transcribe`, `search_similar`, `evidence_analyze` |
| **Document** | VLM, OCR & Entity Extraction | `vlm_analyze`, `langextract_legal`, `evidence_upload` |
| **Case** | Case CRUD & Legal Reporting | `cases_load`, `citations_search`, `poi_search`, `reports_generate` |
| **Codebase** | Static Analysis & Code Audits | `ripgrep_search`, `analyze_file`, `analyze_imports`, `codebase_search` |
| **General** | RAG & System Synthesis | `rag_search`, `ace_context`, `web_search`, `system_health` |

---

## 2. The Supervisor Loop

The supervisor agent (Gemma 4) acts as the central router. When a task arrives, it follows this loop:

1.  **Intent Classification**: Analyzes the query to determine the required domain.
2.  **Sub-Agent Delegation**: Spawns a child worker (ReAct agent) using `createSubagent()`.
3.  **Context Handover**: Passes relevant ACE context and mission parameters to the child.
4.  **Tool Execution**: The sub-agent executes its scoped tools (e.g., `CodebaseSubagent` runs `ripgrep`).
5.  **Synthesis**: The child returns structured results to the supervisor.
6.  **Final Response**: The supervisor synthesizes the child's output into the final mission brief.

### Routing Logic (Fallback)
If the supervisor is uncertain, the system uses a keyword-based `classifyIntent()` fallback:
- **Audio**: `transcribe`, `whisper`, `recording`.
- **Document**: `ocr`, `pdf`, `vlm`, `evidence`.
- **Case**: `citation`, `poi`, `statute`, `warrant`.
- **Codebase**: `import`, `ripgrep`, `migration`, `api route`.

---

## 3. Tool-Call Tracing

Every sub-agent tool call is recorded with:
- `parentTaskId`: To link back to the supervisor mission.
- `runId`: For execution timeline tracking.
- `toolInput` / `toolOutput`: For audit transparency.

## 4. Observability & Tracing
Every sub-agent delegation and tool execution is persisted in the **Context Timeline** for full-lifecycle traceability.

- **Storage**: `context_timeline` table (Postgres).
- **Linking**: `parentTaskId` and `runId` enable hierarchical reconstruction of the mission DAG.
- **Dashboards**:
    - **Live View**: `/code-intel/subagents` (Admin Dashboard).
    - **Historical Audit**: `SELECT * FROM context_timeline WHERE parent_task_id = '...'`.
- **Smoke Test**: `npm run smoke:trace:full` validates the propagation of tracing IDs from API ingress to MCP tool dispatch.
