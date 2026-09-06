## ADDED Requirements

### Requirement: ModelResolutionV1 distinguishes requested, internal, and runtime-reported model identity
The system SHALL define a `ModelResolutionV1` record carrying `requestedModel` (the model name/alias
a caller asked for, e.g. `yorha-legal`), `internalModel` (the resolved application-level canonical
target, e.g. an Ornith profile name), `runtimeModelId` (the identifier llama-server actually
reports, e.g. via `/v1/models` or `/props`), `runtimeModelPath` (the loaded GGUF file path, when
reported), `resolutionSource` (enum `REQUEST_ALIAS` | `CONFIG` | `LLAMA_V1_MODELS` |
`LLAMA_PROPS`), and `runtimeDiscovered` (boolean, whether the runtime identity was confirmed via a
live query vs. assumed from config).

#### Scenario: Requested alias resolves to a stable internal target
- **WHEN** a caller requests `yorha-legal` (or an equivalent stable application-level alias)
- **THEN** the recorded `internalModel` names a stable Parent Atlas model profile, independent of which physical GGUF file is currently loaded

#### Scenario: Runtime identity is not assumed to equal the internal target
- **WHEN** `runtimeDiscovered` is `false` (no live query has confirmed what llama-server actually has loaded)
- **THEN** code and tests MUST NOT assert that `runtimeModelId` equals a specific hardcoded value, since llama-server's `/v1/models` behavior defaults to reporting the model file path unless a `--alias` override was passed at server startup — a live-runtime detail, not a stable application contract

### Requirement: Tests assert against mocked runtime discovery, not a hardcoded physical model name
Test suites covering model-identity-dependent behavior (e.g. `tests/openai-facade.spec.ts`) SHALL
mock the runtime-discovery call and assert that the response's reported model field matches the
*mocked* runtime identity, not a literal hardcoded GGUF filename or alias string that will go stale
whenever the actually-loaded model changes (a real, recurring problem in this repo — see the
"Ollama Phase-Out" / Gemma4-to-Ornith model-switch history recorded at the top of root CLAUDE.md).

#### Scenario: Test asserts against its own mock, not a fixed model name
- **WHEN** a test mocks runtime discovery to resolve to `{id: 'runtime-model-under-test'}`
- **THEN** the test asserts the resulting response's model field equals `'runtime-model-under-test'`, not any literal production model name (e.g. neither `gemma4-rotorquant:latest` nor `ornith-1.5-9b` hardcoded as the expected value)

#### Scenario: A separate test covers the internal canonical profile without requiring a live server
- **WHEN** a test wants to verify that the `yorha-legal` alias resolves to the correct internal Ornith profile
- **THEN** that assertion is made against the `internalModel` resolution step in isolation, independent of and without depending on any live llama-server instance being reachable
