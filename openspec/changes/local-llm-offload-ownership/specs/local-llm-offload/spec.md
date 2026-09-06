## ADDED Requirements

### Requirement: Canonical capability identity separate from model identity

The local repo-audit MCP SHALL expose a stable capability identity
(`local-llm-offload`) that is independent of whichever model the underlying
llama-server runtime currently loads. Callers SHALL NOT need to know or
hardcode the current model name to use the capability.

#### Scenario: Server identity reports the canonical name

- **WHEN** an MCP client sends `initialize` to the local repo-audit MCP
- **THEN** the response `serverInfo.name` is `local-llm-offload`

#### Scenario: Runtime model changes without breaking callers

- **GIVEN** the underlying llama-server model changes (e.g. Gemma4 to Ornith,
  or a future model)
- **WHEN** a caller invokes a canonical tool (`repo_report_answer`,
  `repo_chat`, `repo_summarize`, `repo_classify`, `repo_llm_health`)
- **THEN** the call succeeds without any change to the caller's tool name or
  arguments

### Requirement: Model resolution fails closed, never guesses

The MCP SHALL treat `GET /v1/models` as verification only, never as
selection. It SHALL NOT silently choose an arbitrary model when observation
is ambiguous or empty.

#### Scenario: Configured model matches observed model

- **GIVEN** `LLAMA_PRIMARY_MODEL` is set to a model id
- **WHEN** that id appears in the backend's `GET /v1/models` response
- **THEN** the call proceeds using that model

#### Scenario: Configured model does not match observed model

- **GIVEN** `LLAMA_PRIMARY_MODEL` is set to a model id
- **WHEN** that id does NOT appear in the backend's `GET /v1/models` response
- **THEN** the call fails closed with an explicit mismatch error, and no
  request is sent to `/v1/chat/completions`

#### Scenario: No configured model, single model observed

- **GIVEN** `LLAMA_PRIMARY_MODEL` is unset
- **WHEN** the backend's `GET /v1/models` response contains exactly one model
- **THEN** that model is used (this is observation of the one running model,
  not an arbitrary choice)

#### Scenario: No configured model, multiple models observed

- **GIVEN** `LLAMA_PRIMARY_MODEL` is unset
- **WHEN** the backend's `GET /v1/models` response contains more than one
  model
- **THEN** the call fails closed with an explicit ambiguity error rather than
  selecting the first entry

### Requirement: Deprecated aliases preserve exact behavior of canonical tools

Each deprecated `gemma4_*` tool name SHALL delegate to the exact same
implementation as its canonical `repo_*` counterpart, with no behavioral
fork, until removed after a caller census confirms zero remaining callers.

#### Scenario: Alias and canonical tool produce identical output

- **GIVEN** identical arguments
- **WHEN** `gemma4_chat` is called and, separately, `repo_chat` is called
- **THEN** both invoke the same underlying implementation function and
  produce the same output for the same inputs

### Requirement: Health probe reports configured vs. loaded model explicitly

The health tool (`repo_llm_health`, alias `gemma4_health`) SHALL return an
envelope that explicitly distinguishes the configured model authority from
the live-observed loaded model, plus the canonical/deprecated tool name
sets.

#### Scenario: Health probe envelope shape

- **WHEN** `repo_llm_health` is called
- **THEN** the response includes `configuredModel`, `loadedModel`,
  `modelMatch`, `canonicalService`, `canonicalTools`, `deprecatedAliases`,
  and `writesPerformed: false`
