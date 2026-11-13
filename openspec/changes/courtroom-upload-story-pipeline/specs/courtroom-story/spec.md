## ADDED Requirements

### Requirement: Story cues are deterministic and typed
The courtroom story engine SHALL fire each cue at most once, at its tick, in a pure `step` function, and SHALL reject a story whose cue names an unknown actor, kind or station.

#### Scenario: A move cue records a destination
- **WHEN** a cue of kind `move` with value `witness` reaches its tick
- **THEN** the actor's entry in `positions` becomes `witness`
- **AND** replaying the same inputs produces an identical state

#### Scenario: A move cue with an unknown station is rejected
- **WHEN** a story contains a `move` cue whose value is not a floor-plan station
- **THEN** `validateStory` returns false

### Requirement: One story actor steers a scene character at a time
The scene adapter SHALL refuse a move or animation for a scene character that another story actor currently holds, and SHALL report a conflict receipt naming the entity, requester, holder and action.

#### Scenario: Two actors share one mesh
- **WHEN** the jester is walking the `defense` character and `alice` requests an animation for it
- **THEN** the animation is not applied
- **AND** a receipt with reason `ENTITY_HELD_BY_OTHER_ACTOR` is reported

### Requirement: Movement stays on open floor
The scene SHALL refuse a route that has fewer than two finite points, leaves the room, or crosses a blocked cell, and SHALL resolve that move as `unavailable`.

#### Scenario: A straight line through a table
- **WHEN** a route passes through the prosecution table
- **THEN** no walk starts

### Requirement: Uploaded evidence grounds every dialogue cue
A story generated from uploaded documents SHALL start unreviewed, and every dialogue cue SHALL reference an existing chunk id as its required evidence.

#### Scenario: A generated line has no source chunk
- **WHEN** a proposed dialogue cue references no existing chunk
- **THEN** the story fails validation and is not offered for play

### Requirement: The local preview creates no server records
The local story preview SHALL NOT create a case, a session or any database row, so each pipeline stage can be tested before an upload is trusted.

#### Scenario: Running the preview
- **WHEN** the local preview plays a story to its end
- **THEN** the only non-GET request is analytics

### Requirement: Case scene generation is an explicit, provenance-preserving action
The case evidence board SHALL start scene generation only after an authorized user explicitly requests **Set the scene** for evidence belonging to that case. Uploading or viewing evidence alone SHALL NOT start reconstruction. Original evidence bytes and identity SHALL remain unchanged; generated geometry, LOD assets, and reconstructed events SHALL be stored and displayed as derived hypotheses with source, model, rights, tool, and output provenance.

#### Scenario: User requests a scene for selected case evidence
- **WHEN** an authorized case member selects evidence attached to that case and invokes **Set the scene**
- **THEN** the system records an idempotent durable scene-generation job linked to the case and selected evidence revisions
- **AND** Detective Mode shows queued or processing status until a provenance-complete scene manifest passes eligibility checks

#### Scenario: Upload occurs without a scene request
- **WHEN** evidence is uploaded to a case without an explicit **Set the scene** request
- **THEN** the upload pipeline stores and processes the evidence under its existing contract
- **AND** no scene-generation job or reconstructed scene is created

#### Scenario: Request includes evidence from another case
- **WHEN** a scene-generation request includes an evidence ID that is not attached to the authorized case
- **THEN** the request is rejected without creating a scene job or disclosing the other case's evidence

#### Scenario: Derived scene is not eligible for display
- **WHEN** a scene output lacks verified source readback, source hash, model/rights provenance, output hashes, or a qualified renderer/loader receipt
- **THEN** Detective Mode refuses to present it as an eligible scene

### Requirement: Detective Mode loads typed scene assets through an eligible manifest
The case scene viewer SHALL load only authorized, eligible, provenance-qualified assets from its manifest. Mesh assets and Gaussian splat assets SHALL retain distinct format and derivation identities; neither representation SHALL be inferred from the other.

#### Scenario: Load a mixed mesh and splat scene
- **WHEN** an eligible manifest references a GLB mesh proxy and an SPZ appearance asset for the same scene revision
- **THEN** the viewer loads each through its qualified loader, displays their separate measured/hypothesis labels, and retains independent hashes and source lineage

#### Scenario: Unsupported or invalid scene asset
- **WHEN** an asset has an unsupported format, invalid hash, unavailable loader, or fails to load
- **THEN** the viewer reports a stable unavailable/fallback state and does not relabel another format as the missing asset

### Requirement: Contextual case chat remains usable during scene inspection
Detective Mode SHALL offer a compact case-scoped assistant composer that can expand without replacing or resetting the scene. Its answers SHALL use only authorized case context and expose source references; suggestions SHALL remain user-reviewed proposals until explicitly accepted.

#### Scenario: Expand contextual chat while navigating
- **WHEN** the user expands chat while moving the scene camera
- **THEN** the scene remains mounted, camera and marker state are preserved, and camera navigation remains available

#### Scenario: Scene and case summaries load independently
- **WHEN** Detective Mode begins loading an eligible scene and case summaries
- **THEN** summary retrieval proceeds independently from asset loading, each has its own progress/failure state, and a slow summary does not block scene interaction

#### Scenario: Assistant proposes an action
- **WHEN** the assistant suggests a timeline question, evidence comparison, or marker-related action
- **THEN** the suggestion is displayed as a draft with its supporting evidence references and causes no case/scene mutation until the user explicitly accepts it

### Requirement: Evidence markers stay legible and preserve anchor meaning
Detective Mode SHALL render marker controls at a consistent screen-space size as the camera moves, while preserving their projected scene anchor. The data model SHALL distinguish source-image evidence anchors from pins placed on reconstructed hypothesis geometry.

#### Scenario: Marker remains legible at different zoom levels
- **WHEN** the user moves the camera closer to or farther from a scene marker
- **THEN** the marker hit target remains 40–48 CSS pixels and its glyph remains 24–32 CSS pixels, while a leader line or equivalent visual continues to identify its projected anchor

#### Scenario: Pin is placed on inferred geometry
- **WHEN** the user places a pin on a reconstructed mesh or splat scene
- **THEN** the pin is stored and displayed as a hypothesis-surface hotspot bound to the scene/reconstruction revision, not as a source-grounded evidence anchor

#### Scenario: Scene revision changes
- **WHEN** a reconstructed mesh revision changes
- **THEN** mesh triangle/barycentric anchors from the prior revision are marked stale or remapped through an explicit validated transform; they are not silently reused on the new mesh
- **AND** the case board remains usable with a clear status and its existing depth-relief fallback

### Requirement: Case evidence analysis is multimodal, indexed, searchable, and reviewable
The evidence-mode workflow SHALL support authorized document, image, audio, and video evidence while preserving one canonical evidence identity and immutable source revision. Registration SHALL bind the authenticated actor, case, evidence ID, source object key, verified SHA-256, MIME/signature, size, rights/admission state, and idempotency key. Before reading an object, embedding, indexing, searching, or returning a result, the system SHALL verify current case and evidence access. Each modality SHALL create a durable analysis job and source-qualified derived records through existing owners; upload or a model response alone SHALL NOT count as admitted, indexed, or searchable evidence.

The pipeline SHALL retain document text/OCR and layout with page/region citations; audio transcription with word/segment timestamps and diarization status; video keyframes with timestamps and extraction policy; and visual detections/captions with normalized regions and frame references. Every derived record SHALL include evidence ID, case ID, source revision and SHA-256, model/tool/preprocess/prompt revision, output-schema revision, confidence or explicit unscored status, and proposal/reviewer state. Search results SHALL resolve to the original evidence and exact page, time range, frame, or region. Human corrections SHALL remain attributable annotations, separate from immutable machine output and original bytes.

PostgreSQL 18 SHALL own canonical evidence registration, case authorization, jobs, review state, source lineage, and approved pgvector embeddings. Existing evidence/media/transcript/frame/job tables and migrations SHALL be reconciled before adding columns or tables. Valkey caches and Qdrant/RTX indexes SHALL be rebuildable projections; their keys and records SHALL include authorization-scope and source/model/index revisions. Reauthorize before cache lookup and before delivery. Do not persist model KV cache, hidden reasoning, or transient tensor state.

Document, audio, image, and video indexing SHALL be explicit, independently observable stages with idempotency, bounded retries, dead-letter/failure reasons, and exact readback. The search acceptance test SHALL prove that an authorized indexed item is findable and returns its exact source citation, while a different case member without access cannot register, search, retrieve, or infer its existence. An upload HTTP success, fixture-only embedding, vector count, model caption, or courtroom scene preview does not prove this path.

Video processing SHALL use a deterministic versioned keyframe policy with maximum duration, dimensions, frame count, bytes, runtime, and model-token budget. Store the selected timestamps, frame hashes, extraction tool/version, policy revision, and estimated/actual token use. At the stated estimate of 140 tokens per frame, 58 frames require about 8,120 tokens, already beyond an 8,000-token allowance before transcript, instructions, or output. Reserve non-image context; actual image tokenization is model/resolution dependent and MUST be measured for the selected model. Sampling may use scene changes, motion, and a bounded temporal schedule, but may not silently discard a source interval.

Transcription, OCR, captioning, object detection, and time-bounded behavioral-event descriptions SHALL be proposals grounded in exact source locations. Behavioral labels SHALL describe observable actions only; they SHALL NOT infer intent, emotion, culpability, or identity. Generated or edited images SHALL be visibly marked as illustrative hypotheses, stored separately with generation provenance, and SHALL never replace, alter, or be indexed as original evidence.

Face detection may return a region or within-item track reference only. Facial identity matching, biometric template creation, cross-case matching, and person-of-interest identification SHALL be disabled by default and require a separate approved capability, lawful-purpose and rights review, authorized gallery, human confirmation, calibrated thresholds, subgroup/quality evaluation, audit, and rollback. Model output alone SHALL not identify a person or associate one with a case.

Quantized embeddings, TurboVec/TurboQuant, NES LUT codes, radix ordering, bloom filters, Parquet, MessagePack, nibble/bit-packed formats, or other binary encodings are optional optimizations, not evidence authority. They require a measured bottleneck, an existing owner, explicit version and byte order, canonical source bindings, checksums, deterministic decode/round-trip tests, exact bounded rescore or scalar parity, and a safe canonical fallback. Bloom filters are hints, never proof of access, uniqueness, or absence. Parquet is for bounded offline analytics/export, not the canonical transaction record. Fine-tuning SHALL remain disabled until a registry records dataset lineage/rights, de-identification, person/case/source-separated splits, artifact checksums, evaluation results, approval, and rollback.

#### Scenario: Evidence is registered and indexed
- **WHEN** an authenticated case member registers an admitted source object and requests analysis
- **THEN** the server verifies case membership, bytes, signature, SHA-256, and source revision before durable registration
- **AND** the job produces idempotent modality-specific derived records and an index receipt tied to the same evidence revision
- **AND** the original object remains unchanged

#### Scenario: Search returns source-grounded results
- **WHEN** an authorized user searches indexed case evidence
- **THEN** each result resolves to the authorized evidence and an exact document page/region, audio time range, or video frame/time range
- **AND** stale or mismatched source/index revisions are omitted or reported unavailable
- **AND** an unauthorized case search returns no evidence content or existence signal

#### Scenario: Video exceeds its budget
- **WHEN** sampled frames plus transcript and prompt exceed the configured model budget
- **THEN** the versioned sampler reduces or rejects the selection, reserves budget for non-image context, and records the selected timestamps and token estimate
- **AND** it does not report 58 nominal 140-token frames as fitting an 8,000-token budget

#### Scenario: A machine observation is reviewed
- **WHEN** a reviewer opens a transcription, OCR, caption, detection, or behavioral-event proposal
- **THEN** the UI seeks to the exact source time/frame/page/region and displays provenance and uncertainty
- **AND** acceptance, correction, or rejection is stored as an attributed annotation without rewriting source bytes or machine output

#### Scenario: Face is detected
- **WHEN** image or video analysis detects a face
- **THEN** the default output is limited to a non-identifying region or within-item track reference
- **AND** no named identity, person-of-interest match, biometric template, or cross-case association is created

#### Scenario: A compact representation is considered
- **WHEN** an index candidate uses quantization or a binary encoding
- **THEN** it preserves canonical evidence identity and revision, records format/version/byte order/checksum, and passes deterministic parity and source-citation tests before admission
### Requirement: Compact analysis packets preserve canonical evidence and expose quantization error
A compact packet MAY carry bounded detection, transcript-reference, temporal, or vector-descriptor data for CPU/GPU/RPC processing, but SHALL remain a derived transport/index representation. It SHALL NOT contain or replace original audio/video/image bytes, canonical transcript text, authoritative labels, or PostgreSQL 18 evidence/vector rows. A packet SHALL be linked to its canonical evidence ID and source SHA-256 by a versioned envelope and independently verifiable checksum. Protobuf/gRPC SHALL carry the authorization/request context and packet descriptor; packed payload bytes SHALL define their own version, codec, dimensions, byte order, and bounds. Use little-endian for multi-byte numeric values inside the payload, and reject unknown versions/codecs or malformed lengths.

For an optional 4 KiB maximum packet, define 4 KiB as 4,096 total bytes = 32,768 bits. A proposed 176-byte header leaves at most 3,920 payload bytes:
- offsets 0–3 magic; 4–5 schema version; 6–7 header length; 8–11 flags; 12 modality; 13 codec; 14–15 component count; 16–19 payload length;
- 20–35 evidence UUID bytes; 36–67 full source SHA-256; 68–99 model-artifact SHA-256; 100–131 policy/sampler SHA-256;
- 132–135 start time ms; 136–139 end time ms; 140–143 frame/segment ordinal; 144–175 payload SHA-256.
This is a proposed wire format, not an existing database schema or protobuf contract. The gRPC envelope remains responsible for authenticated actor, authorized case, request ID, grant revision, deadline, and cancellation; the packet cannot self-authorize.

Representation rules:
- A 768-dimensional sign sketch needs 768 bits = 96 bytes. A 4,096-byte bitset holds 32,768 Boolean features; it is not a 4,096-feature bitset.
- A 768-value vector uses 1,536 bytes as IEEE fp16, 768 bytes as int8, 384 bytes as int4, or 96 bytes as a one-bit sign sketch. These encodings have different error/recall and are not interchangeable.
- One proposed 16-byte detection record is class ID u16, confidence u16, four normalized coordinates u16 each, frame ordinal u16, and within-item track ordinal u16. It is a proposal format only; labels and track ordinals must resolve through versioned registries/manifests and remain non-identifying.
- Transcript text and source frame crops remain in canonical rows/object storage. A packet may carry time/offset references, not a lossy substitute for the source.

For symmetric signed b-bit scalar quantization with qmax = 2^(b-1)-1, a calibration scale s gives q_i = clamp(round(x_i/s), -qmax, qmax) and reconstruction xhat_i = s q_i. A simple initialization is s = max_i |x_i|/qmax. Select the deployed scale by minimizing held-out reconstruction error E(s) = (1/N) sum_i (x_i - s clamp(round(x_i/s), -qmax, qmax))^2, then measure downstream ranking/citation recall as well. Do not fit or select quantization parameters on the evaluation set.

An optional EmbeddingGemma 2 MRL payload MAY use nested prefixes at 128, 256, 512, and 768 dimensions only after the deployed model identifier, revision, modality/task contract, and prefix behavior are verified. This is a candidate representation, not a change to the canonical `semantic_768` owner or a global ban on unrelated legacy/experimental dimensions. For a full-vector symmetric int8 encoding, define `scale = max(abs(v))/127`, `q_i = clamp(round(v_i/scale), -127, 127)`, and reconstruct `vhat_i = scale*q_i`. For each supported prefix `d`, compute its norm from the quantized prefix `q[:d]` (or recompute it); a norm measured only from the original float prefix does not make the quantized score exact. A score using `q[:d]` is approximate and SHALL be compared to the model's correctly truncated-and-renormalized float prefix and the canonical 768-dimensional vector. Exact bounded rescore remains against the canonical vector. Keep query and document model/task/revision contracts aligned and explicitly renormalize truncated MRL prefixes when required by that model.

The proposed 128-byte packet header in an alternate layout conflicts with this requirement's 176-byte provenance header. The proposed MRL packet's remaining fields total 3,968 bytes after its 128-byte header, exceeding the 3,920-byte payload allowed by the 176-byte header by 48 bytes. No fixed payload layout SHALL be frozen until offsets, bounds, checksums, and these competing header proposals are reconciled. A CRC detects accidental corruption but does not authenticate a packet; retain the full payload digest and authenticated RPC scope. A 96-byte sign sketch is three 32-byte AVX2-width blocks, but AVX2 does not itself provide `VPOPCNTDQ`; population-count implementation must use a supported scalar/lookup path or separately detected hardware and prove parity.

For sign sketches b_i = 1[x_i >= 0], Hamming distance h between m-bit sketches may be used for candidate ordering only. For random-hyperplane projections, estimate angular distance as theta_hat = pi h/m and cosine as cos(theta_hat); this estimate is approximate and requires measured Recall@K against canonical fp32 vectors with exact bounded rescore. It is never evidence identity, access, or permission.

A proposed cross-modal fused vector is z = normalize(sum_m w_m a_m z_m), where z_m is a normalized modality vector, a_m is an availability mask, and w_m are learned or explicitly fixed weights. This fusion is permitted only when modality spaces are proven aligned on a rights-cleared held-out set. Text, transcript, OCR, and VLM caption text may share a text embedding path only when the same model/revision contract is used. Do not assume raw image/audio embeddings align with EmbeddingGemma because dimensions match. Fit weights and calibration parameters on training/validation splits separated by person, case, and source; freeze them before evaluation.

For spherical K-means, normalize input vectors x_i and centroids mu_k; assign c_i = argmax_k x_i dot mu_k and update mu_k = normalize(sum_{i:c_i=k} x_i). K, initialization, stopping criteria, and empty-cluster policy SHALL be versioned. Clusters are candidate-routing hints only, never evidence identity or canonical domain assignment. Compare cluster routing with a deterministic unclustered baseline using held-out retrieval recall, citation accuracy, stability, latency, and memory.

#### Scenario: Packet crosses an RPC boundary
- **WHEN** a bounded analysis packet is sent to a worker
- **THEN** the worker validates authenticated envelope scope, version, endian, length, source/model/policy hashes, and payload checksum before decoding
- **AND** cancellation, deadlines, duplicate request IDs, and queue limits are enforced
- **AND** the response preserves source evidence identity and cannot publish canonical state without the existing PostgreSQL admission path

#### Scenario: Quantized retrieval is evaluated
- **WHEN** a sign, int4, or int8 representation is proposed for retrieval
- **THEN** quantization parameters are fit on a training/calibration partition and evaluated against frozen canonical fp32 vectors
- **AND** exact bounded rescore and citation/authorization checks occur before results are shown
- **AND** the result is rejected if quality or identity parity misses its declared threshold

#### Scenario: Nested MRL prefixes are proposed for a compact packet
- **WHEN** an EmbeddingGemma 2 vector is sliced to a supported MRL dimension and quantized for a packet or coarse index
- **THEN** the model/task/revision and prefix dimension are verified, quantized-prefix norms are correct for the encoded values, and approximate scores are measured against canonical float retrieval
- **AND** the packet budget, header, checksum, AVX2/scalar population-count path, and PostgreSQL expression-index behavior are validated in deterministic fixtures and a disposable PostgreSQL 18 rollback rehearsal before admission
- **AND** candidate retrieval is exactly rescored against the canonical vector with case authorization and source citations preserved
