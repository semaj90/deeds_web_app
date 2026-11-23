## ADDED Requirements

### Requirement: Evidence observations retain source and analysis provenance
The system MUST bind every visual, OCR, transcript, context, event, and derived-scene observation to the canonical evidence identity, source hash/revision, analysis run/revision, timestamp or source-image coordinate frame, model/tool revision when applicable, and immutable artifact reference. Large masks, depth maps, images, meshes, and splats MUST remain binary artifacts addressed by hash rather than base64 payloads in JSON or PostgreSQL rows.

#### Scenario: Analysis coverage is incomplete
- **WHEN** an image or video analysis stage is skipped, unavailable, failed, or omits inputs
- **THEN** the storybook records that stage status and the unexamined scope separately from a reviewer decision that no object was observed

#### Scenario: Derived image is transformed
- **WHEN** an image is resized, cropped, rotated, or letterboxed for analysis
- **THEN** the derivative records its own hash and the transform needed to map observations back to the original image coordinates

### Requirement: Visual labels, scene context, and text remain distinct proposals
The system MUST keep object detections and masks, whole-scene descriptions, OCR/transcript spans, and event/role hypotheses as separate typed observations. Model scores and labels MUST be presented as proposals with their model and run provenance; a schema-valid result MUST NOT be represented as proof of accuracy or completeness. The system MUST NOT infer a person's identity, legal role, event, causality, crime occurrence, or confirmed location from appearance or visual prominence alone.

#### Scenario: Dense detector output contains duplicates or misses
- **WHEN** a reviewer opens a frame with overlapping or low-confidence detections
- **THEN** the interface preserves source pixels, exposes proposal confidence and coverage, permits correction or unknown/rejection review, and does not claim an exhaustive inventory

#### Scenario: Scene description names a setting
- **WHEN** a vision model proposes a context such as “courtroom-like interior”
- **THEN** the context is displayed separately from object labels and remains unreviewed until an authorized reviewer records a decision

#### Scenario: OCR text is processed by NLP
- **WHEN** 8095 receives OCR, transcript, or reviewer text
- **THEN** each extracted entity or role proposal cites an exact text span and source revision, and the response is not treated as visual recognition or identity proof

### Requirement: Storybook drafts and legal research use admitted citations
The system MUST validate storybook drafts against the exact current source and analysis revisions and allow citations only to observations admitted in the bounded prefill packet. Legal research MUST be a separate result built from case-authorized, jurisdiction-qualified authority spans in an admitted ACE ContextManifest; raw retrieval/MCP hits MUST NOT be sent directly to a synthesis model. Generated prose MUST distinguish observed source content, model hypotheses, reviewer statements, and legal research, and MUST NOT assert a legal conclusion.

#### Scenario: Source changes while a draft is generated
- **WHEN** the source or analysis revision changes between prefill and response
- **THEN** the server rejects the stale draft and asks the reviewer to refresh the chapter

#### Scenario: Legal context is unavailable or unadmitted
- **WHEN** no jurisdiction-qualified, revision-bound ContextManifest can be admitted
- **THEN** the legal-research panel reports unavailable/needs review and does not synthesize from unranked or raw retrieval hits

#### Scenario: Reviewer saves a storybook chapter
- **WHEN** an authorized reviewer saves a chapter from a current source-bound draft
- **THEN** the canonical scene revision stores the exact citation snapshot and rechecks case membership, source revision, analysis revision, artifact hashes, and citation IDs before commit

### Requirement: Scene coordinates advance only through explicit review gates
The system MUST keep original-image pixels, relative monocular depth, calibrated ground-plane coordinates, and shared-world coordinates distinct. A still image may produce image-space cells and a labeled relative-depth 2.5D estimate; it MUST NOT imply metric dimensions or a unified 3D position. Mapping into a ground plane or shared world requires accepted calibration and an explicit reviewed transform. Independent sources MUST remain in separate coordinate frames until a qualified multi-view alignment is accepted.

#### Scenario: Single image is converted to a scene view
- **WHEN** a reviewer places a detection or annotation from one image into Detective Mode
- **THEN** it appears in the source-image coordinate space as an image-space marker/cell or explicitly labeled illustrative proxy, without a fabricated world transform

#### Scenario: Multiple views lack accepted alignment
- **WHEN** images or video frames do not share a reviewed camera/world transform
- **THEN** the scene keeps them as separate source frames and does not join their geometry or draw an inferred travel path

#### Scenario: Pick a compiled scene object
- **WHEN** an investigator selects a rendered object using the scene BVH
- **THEN** the inspector resolves it to the saved scene revision and its source observation/artifact references; BVH picking does not perform semantic or legal search

### Requirement: Indexed palette visuals use revision-bound sidecar bindings
The renderer MAY consume a read-only visual binding that joins a stable scene object and scene revision to an authorized indexed-palette artifact, source revision, content hash, and normalized-UV affine transform. The client MUST recheck the expected case/scene/object/source scope and verify the fetched artifact hash before rendering. Palette indices, candidate-ordinal bitsets, and retrieval-feature INT4 values MUST remain separate representations; a candidate-selection bitset MUST NOT be interpreted as a per-pixel mask. The affine transform MUST be labeled `NORMALIZED_UV` and MUST NOT change source-image or world-coordinate evidence claims.

#### Scenario: Visual asset or scene binding is stale
- **WHEN** a palette artifact's revision/hash or the expected scene/object/source scope does not match the binding
- **THEN** the client rejects the visual upgrade and retains the existing placeholder or material

#### Scenario: A valid affine palette visual is loaded
- **WHEN** an authorized binding and exact artifact bytes are current
- **THEN** the existing WebGL2/WebGPU palette shader applies the binding's normalized-UV affine transform while stable scene-object identity and scene revision remain unchanged
