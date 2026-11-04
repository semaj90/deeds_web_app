## ADDED Requirements

### Requirement: Scene assets SHALL retain source, model, and encoding provenance
Every generated scene asset MUST have a versioned manifest that binds the exact input evidence identifiers, source revisions and hashes to the output hash, format/version, Gaussian count, byte size, encoder/library revision, settings, coordinate convention, and quality receipt. Model-derived assets MUST identify the model and immutable model revision and record the applicable license decision. A manifest MUST distinguish source evidence from derived artifacts.

#### Scenario: A scene asset is admitted for display
- **WHEN** a client requests a generated scene asset
- **THEN** the service returns it only when its manifest validates and its input and output hashes match the stored objects
- **AND** the manifest identifies the source evidence and the exact encoder and settings used

#### Scenario: Provenance is absent or mismatched
- **WHEN** a manifest is missing required provenance or a stored object hash does not match
- **THEN** the asset is ineligible for display and the service reports a stable unavailable status

### Requirement: Scene epistemic status SHALL remain explicit
Each scene MUST be classified as `MEASURED_MULTI_IMAGE`, `SINGLE_IMAGE_HYPOTHESIS`, or `SYNTHETIC_FIXTURE`. The viewer MUST visibly distinguish measured geometry from inferred or synthetic content. Inferred geometry MUST NOT be represented as observed evidence or used as a source anchor for an evidence annotation.

#### Scenario: Measured multi-image reconstruction is shown
- **WHEN** a scene with registered multi-image geometry is opened
- **THEN** the viewer labels it as measured reconstruction and provides links to its source images and reconstruction receipt

#### Scenario: Single-image hypothesis is shown
- **WHEN** a scene inferred from one image is opened
- **THEN** the viewer labels the scene as a hypothesis and prevents annotations on inferred geometry from being represented as evidence-grounded source anchors

### Requirement: Asset budgets SHALL be verified against produced bytes and quality
The scene pipeline MUST compare each encoded artifact's actual byte size with its configured budget and MUST record quality measurements against a fixed view set and baseline. It MUST report `BUDGET_NOT_MET` when the size target cannot be met without crossing the approved quality floor. A requested Gaussian count or estimated compression ratio MUST NOT be treated as proof that the byte budget was met.

#### Scenario: Output satisfies size and quality gates
- **WHEN** encoding completes and actual bytes and quality measures meet their configured limits
- **THEN** the receipt records the measured size, measurements, thresholds, and `BUDGET_MET`

#### Scenario: Output exceeds budget or fails quality
- **WHEN** encoding cannot satisfy both the byte budget and quality floor
- **THEN** the result remains non-promotable with `BUDGET_NOT_MET` or `QUALITY_NOT_MET` and preserves the measured values

### Requirement: SPZ and renderer-specific LOD assets SHALL have distinct identities
The pipeline MUST identify SPZ files by their actual SPZ version and distinguish them from renderer-specific LOD derivatives such as Spark `.RAD` or `.RADC`. A derived LOD asset MUST record its parent asset hash, producing tool/version, and its own hash and size. The system MUST NOT describe a `.RAD` derivative as SPZ.

#### Scenario: SPZ v4 and a derived LOD are available
- **WHEN** a scene has an SPZ v4 base asset and a renderer-specific LOD derivative
- **THEN** the manifest records separate formats, hashes, sizes, and derivation provenance for both assets

#### Scenario: A derivative cannot be tied to its parent
- **WHEN** an LOD derivative lacks a matching parent hash or tool identity
- **THEN** it is not selected for display and the base asset remains independently addressable

### Requirement: Scene generation SHALL use the existing durable analysis job owner
Expensive scene encoding MUST execute asynchronously through the existing `analysis_jobs` durable job lifecycle. PostgreSQL remains canonical for job state and output eligibility. A queue or message broker MAY wake workers but MUST NOT become a second source of job truth. Requests MUST be idempotent and worker retries MUST not create duplicate canonical scene assets.

#### Scenario: A valid scene job is requested
- **WHEN** an authorized request passes source, rights, and resource admission
- **THEN** the API records or reuses one idempotent analysis job and returns its stable identifier without running native encoding in the request handler

#### Scenario: A worker retries a completed job
- **WHEN** the same admitted job is delivered more than once
- **THEN** the worker reuses the completed result or safely resumes and does not create duplicate canonical outputs

### Requirement: Unqualified model rights SHALL block product scene generation
The production scene pipeline MUST fail closed when model or dataset rights are unknown or incompatible with the intended use. Research-only or unlicensed candidate models MUST NOT be loaded by a product generation path until their terms are verified and recorded.

#### Scenario: Candidate has verified compatible rights
- **WHEN** the model and source dataset have recorded rights compatible with the intended use
- **THEN** admission records the rights references and allows the job to proceed to other gates

#### Scenario: Candidate rights are missing or incompatible
- **WHEN** model or dataset rights are missing, research-only, or incompatible
- **THEN** admission rejects the product job with a stable rights-blocked status and does not load the model

### Requirement: The detective viewer SHALL provide an honest supported fallback
The scene viewer MUST use a maintained renderer with a supported browser path, report renderer initialization or asset-load failures, and retain the existing depth-relief viewer as a fallback. It MUST NOT present CPU submission timing or requested point count as GPU execution or visibility measurements.

#### Scenario: WebGL2 scene rendering is available
- **WHEN** a valid scene asset is opened on a supported WebGL2 browser
- **THEN** the viewer renders the scene and reports measured renderer and asset status separately from source or model claims

#### Scenario: Scene rendering is unavailable
- **WHEN** WebGL2 or the scene asset cannot be loaded
- **THEN** the viewer reports the limitation and offers the existing depth-relief preview without changing the scene's epistemic label
