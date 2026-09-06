## ADDED Requirements

### Requirement: Analysis-pass synthesis calls resolve model identity live, never by hardcoded string
Any code path under `sveltekit-frontend/src/lib/server/analysis/` that performs LLM synthesis
(not embeddings, not the separate VLM/document-vision lane) SHALL resolve the target model via a
live discovery mechanism (`resolveLlamaInferenceTarget()` or `VLM_MODELS.legal`) rather than a
literal hardcoded model-name string baked into the request body.

#### Scenario: Ornith is the currently loaded chat model
- **WHEN** an analysis-pass synthesis call is made while llama-server `:8090` reports
  `model_alias: "ornith-1.5-9b"` via `GET /v1/models`
- **THEN** the request sent to `:8090` uses that discovered model identity, not a literal
  `"gemma4-..."` string

#### Scenario: A different model is loaded later
- **WHEN** the operator swaps the loaded model on `:8090` to a different alias
- **THEN** analysis-pass synthesis calls automatically use the newly discovered alias without a
  code change, because they resolve it live rather than trusting a compile-time constant

### Requirement: The VLM/document-vision lane stays on its existing model until explicitly migrated
Code paths that perform document-vision analysis (YOLO object detection + layout, Granite-Docling
document parsing) SHALL continue to use `LOCAL_VLM_MODEL`/`SERVER_VLM_MODEL` and SHALL NOT be
rerouted to the Ornith resolver by this change. `ORNITH-VLM-MMPROJ-01` is now `LIVE_GET_PROVEN`
(see `docs/reports/ornith-vlm-mmproj-01-proof-v1.json`) — a real `ornith-1.5-vlm` startup profile
exists, loads the official Ornith-specific projector (`mmproj-Ornith-1.5-9B-BF16.gguf`, sha256
`626f9f90627402a6bf4a999111d0fbd69b5fcca7aa8ba089d69e5f10e8858e1d`), and has passed live text,
tool-call, JSON-structured-output, and real image-understanding smoke tests. **This proof alone
does not migrate the existing document-vision call sites** — that is a separate, later decision
(distinct throughput/prompt-format/pipeline-integration factors may still favor the existing model
for those specific call sites) and is explicitly out of this requirement's scope. The canonical
family/projector ownership and compatibility profiles are recorded in `models/model-manifest.json`:
`ORNITH_VISION_PRODUCTION` and `GEMMA_VISION_PRODUCTION` are exact-family profiles, while
`ORNITH_MODEL_GEMMA_PROJECTOR` is a non-production compatibility experiment and is load-disabled.

#### Scenario: Text-only profile has no vision
- **WHEN** a caller queries `GET :8090/props` while the `ornith-1.5` (no-mmproj) profile is running
- **THEN** `modalities.vision` reports `false` for that profile only — confirmed live post-change,
  not a claim about Ornith's upstream capability

#### Scenario: The ornith-1.5-vlm profile serves real vision requests
- **WHEN** a caller queries `GET :8090/props` while the `ornith-1.5-vlm` profile is running
- **THEN** `modalities.vision` reports `true`, and a `/v1/chat/completions` request containing a
  real base64-encoded image returns a semantically accurate description of that image's actual
  content — confirmed live, not merely that the server accepted the request

#### Scenario: A Gemma-family projector is never substituted for Ornith
- **WHEN** any code path resolves a multimodal projector for an active model family
- **THEN** it SHALL fail closed on a family mismatch rather than silently loading
  `mmproj-F16.gguf` (Gemma-4-family) against an Ornith model

#### Scenario: Document-vision call sites are not auto-migrated by this proof
- **WHEN** `evidence-analysis-pipeline.ts`'s `synthesizeWithLLM()`, `vlm-evidence-analyzer.ts`, or
  `granite-docling.ts` performs a vision/document-image analysis call
- **THEN** the request targets the existing VLM-specific model constant, never the Ornith resolver
  — `ORNITH-VLM-MMPROJ-01` being `LIVE_GET_PROVEN` makes migration possible, not automatic; these
  call sites migrate only via a separate, explicitly authorized decision

### Requirement: `analysis_pass_results` current-pass selection is proven correct via replay
Before any operation may supersede or invalidate rows in `analysis_pass_results`, the system SHALL
have a passing replay proof demonstrating that the `analysis_pass_current` view's `DISTINCT ON`
selection logic correctly identifies the current pass result for the full 5-column identity
(`packet_key`, `source_revision`, `pass_type`, `pass_revision`, `input_hash`) for a known scenario.
There is no explicit "superseded" marker column — supersession is implicit: among rows sharing one
identity, all but the most recent (by the view's own `ORDER BY`) are superseded by construction.
This requirement covers the selection LOGIC only; it does NOT by itself certify that the currently
*deployed* view definition matches its own source-of-truth file (see the drift finding below,
tracked separately — `docs/reports/parent-atlas/analysis-pass-current-selection-v1.json`).

#### Scenario: A single unsuperseded pass exists
- **WHEN** exactly one `analysis_pass_results` row exists for a given 5-column identity
- **THEN** the current-pass selector (`analysis_pass_current`) returns that row as current —
  confirmed live 2026-09-06 against a real row (`packet:0004b466d863` / `embedding`)

#### Scenario: A superseded pass exists alongside a newer one
- **WHEN** multiple `analysis_pass_results` rows exist for the same 5-column identity
- **THEN** the current-pass selector returns exactly one row — the one the view's own `ORDER BY`
  ranks first — never more than one and never zero, confirmed live 2026-09-06 against a real
  5-row identity (`packet:fb1a78fd2216` / `summarization`, ids 8045/8254/8256/8257/8258) where the
  view returned exactly id 8258, matching an independently-computed `created_at DESC, id DESC`
  ranking

#### Scenario: The deployed view's status filter has drifted from its own source file
- **WHEN** the live `analysis_pass_current` view definition (`pg_get_viewdef`) is compared against
  `sveltekit-frontend/drizzle/manual/analysis_pass_current.sql`
- **THEN** any difference in the status literal filtered on, or in the `ORDER BY` tiebreak columns,
  SHALL be treated as a blocking finding (`BLOCKED_VIEW_SOURCE_DRIFT`) — not a passing proof — even
  though the underlying `DISTINCT ON` selection mechanism itself may still be internally
  consistent; confirmed live 2026-09-06: deployed filter is `status = 'success'` (11,076 legacy
  rows), file says `status = 'succeeded'` (19 current-writer rows), and the deployed `ORDER BY`
  lacks the file's `id DESC` tiebreak

### Requirement: No hidden model state is persisted as an analysis-pass receipt
Analysis-pass receipts written to `analysis_pass_results` SHALL contain only revision-qualified,
grounded observations (source references, revisions, extracted content) and SHALL NOT contain
hidden reasoning/thinking traces, raw KV cache state, or other opaque model-internal state.

#### Scenario: A synthesis call produces a reasoning trace
- **WHEN** the underlying model emits a `reasoning_content`/thinking block alongside its answer
- **THEN** the persisted `analysis_pass_results` row contains only the final grounded content and
  its provenance fields, never the reasoning/thinking block itself
