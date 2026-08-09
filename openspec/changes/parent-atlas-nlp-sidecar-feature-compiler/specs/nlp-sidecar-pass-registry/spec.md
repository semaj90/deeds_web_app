## ADDED Requirements

### Requirement: Every NLP sidecar pass returns the AnalysisPassResult envelope
The system SHALL return every `miniforge_nlp_sidecar.py` pass result
(structural, lexical, linguistic, semantic, sequence, rerank, grounded) as an
`AnalysisPassResult` (`requestId, packetKey, sourceRef, sourceRevision,
family, passName, passRevision, backend, backendVersion, device, inputHash,
outputHash, status, features, artifacts, evidence, warnings`), and SHALL NOT
introduce a new pass with an ad hoc, one-off response shape.

#### Scenario: A new pass type is added to the sidecar
- **WHEN** a new pass (e.g. a future encoder or classifier) is added to
  `miniforge_nlp_sidecar.py`
- **THEN** its response SHALL conform to `AnalysisPassResult`, and SHALL NOT
  invent a parallel response schema

#### Scenario: A requested pass is unavailable
- **WHEN** a caller requests a pass whose backend is not installed/available
  in the running container (e.g. `treesitter-chunker` failed to import)
- **THEN** the system SHALL return `status: 'skipped'` with a `warnings`
  entry explaining why, and SHALL NOT silently omit the pass from the
  response or return a partial/malformed result

### Requirement: The pass registry extends, not replaces, the existing /analyze contract
The system SHALL add pass-registry capability to the sidecar's existing
`POST /analyze` endpoint via additive optional fields, and SHALL NOT break
the existing `NlpAnalyzeRequest`/`NlpAnalyzeResponse`
(`extractionMode`-based) contract that
`sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts` and its
callers already depend on.

#### Scenario: An existing caller sends a request without pass-registry fields
- **WHEN** an existing caller sends an `NlpAnalyzeRequest` with only
  `extractionMode` set (no `passes` field)
- **THEN** the system SHALL behave exactly as it did before this change,
  returning the existing `NlpAnalyzeResponse` shape unchanged

### Requirement: Linguistic passes run only over natural-language text
The system SHALL run spaCy-backed linguistic analysis (POS tagging,
lemmatization, dependency parsing, noun chunks, entity extraction) only over
comments, docstrings, error messages, README/spec text, and query text, and
SHALL NOT run it over source code identifiers or tokens.

#### Scenario: A structural pass produces an identifier
- **WHEN** the structural pass (`treesitter_chunk`) extracts a symbol name
  such as `rerankCandidates`
- **THEN** the system SHALL NOT additionally run spaCy POS/dependency
  analysis on that identifier string

### Requirement: Grounded LLM extraction is opt-in, never in the unconditional hot path
The system SHALL execute LangExtract-backed grounded extraction only when a
caller explicitly sets `groundedExtractionRequired: true`, on an
already-filtered small candidate set, and SHALL NOT run LangExtract as part
of the default/unconditional pass set for every `AstUnit` or query.

#### Scenario: A caller requests the default pass set
- **WHEN** a caller requests structural, linguistic, semantic-card, sequence,
  and rerank passes without setting `groundedExtractionRequired`
- **THEN** the system SHALL NOT invoke LangExtract or make any LLM call
