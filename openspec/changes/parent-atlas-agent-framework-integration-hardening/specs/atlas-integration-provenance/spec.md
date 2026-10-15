## ADDED Requirements

### Requirement: External source acquisition preserves provenance
External-source integrations SHALL record the requested and resolved source reference, acquisition provider/version, capture time, content digest, applicable terms/robots outcome when available, and normalized artifact digest before downstream indexing. Firecrawl SHALL remain an acquisition/staging owner; BeautifulSoup SHALL remain a parser over already acquired markup. Neither SHALL directly promote source identity or write canonical packet/chunk records.

#### Scenario: Firecrawl page proceeds to local parsing
- **WHEN** a page is acquired through the existing Firecrawl owner and parsed by BeautifulSoup
- **THEN** the provenance receipt SHALL bind the acquisition and parser versions, raw and normalized digests, resolved URL, and source reference

#### Scenario: Acquisition or source rights are unknown
- **WHEN** required capture provenance or applicable source-rights metadata is missing
- **THEN** the artifact SHALL remain staged/unverified and SHALL NOT be represented as cleared for redistribution or canonical promotion

### Requirement: Direct web fetches are egress-bounded
Any direct HTTP fetch path used with BeautifulSoup SHALL enforce allowed schemes and hosts, revalidate redirects, reject loopback/private/link-local/internal targets, and apply response-size and timeout ceilings before parsing. Parser-only entry points SHALL accept bounded acquired markup and SHALL NOT fetch URLs.

#### Scenario: Direct fetch targets a private address
- **WHEN** a direct BeautifulSoup fetch resolves or redirects to a loopback, private, link-local, or otherwise disallowed host
- **THEN** the fetch SHALL be rejected before response content is consumed

#### Scenario: Input exceeds configured acquisition bounds
- **WHEN** a direct fetch exceeds its byte or time budget
- **THEN** the adapter SHALL return a typed bounded failure and SHALL NOT parse or persist a partial body

### Requirement: Model provider, runtime, and model artifact are separate identities
Ollama and Hugging Face SHALL be represented as execution/distribution surfaces, not as model identity or model license. Every embedding artifact SHALL identify its exact upstream model, immutable artifact/checksum or unresolved status, runtime/provider, dimensions, precision, task convention, representation revision, and model-card license. A model switch SHALL create a distinct representation revision and SHALL NOT silently replace canonical `semantic_768` vectors.

#### Scenario: EmbeddingGemma versions are compared
- **WHEN** EmbeddingGemma 2 is evaluated against the existing `google/embeddinggemma-300m` deployment
- **THEN** the evaluation SHALL treat them as distinct model artifacts with separate license metadata and require frozen-corpus parity/retrieval evidence before any promotion

#### Scenario: Runtime reports a model alias only
- **WHEN** Ollama or Hugging Face reports a mutable alias without an immutable model/artifact digest
- **THEN** readiness SHALL remain configured/unverified and SHALL NOT claim a revision-qualified canonical embedding producer

### Requirement: License metadata is artifact-specific
The integration inventory SHALL distinguish the license of Firecrawl source/self-hosted software, Firecrawl SDK or hosted service, BeautifulSoup, Ollama runtime, Hugging Face tooling, model weights, and fetched web content. License metadata SHALL be sourced from the relevant versioned license/model/source terms and SHALL NOT be inferred from the hosting or runtime provider.

#### Scenario: EmbeddingGemma 2 is served through Ollama
- **WHEN** Ollama executes an EmbeddingGemma 2 artifact
- **THEN** the receipt SHALL report the Ollama runtime and EmbeddingGemma 2 model license separately

#### Scenario: Firecrawl Cloud is used
- **WHEN** acquisition uses the hosted Firecrawl service rather than self-hosted source code
- **THEN** the provenance record SHALL identify the hosted provider/terms separately from the open-source Firecrawl code license and target-site terms
