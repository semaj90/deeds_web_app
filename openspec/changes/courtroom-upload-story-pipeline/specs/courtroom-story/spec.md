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
