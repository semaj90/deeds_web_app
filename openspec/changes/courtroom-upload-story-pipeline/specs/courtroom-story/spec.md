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
- **AND** the case board remains usable with a clear status and its existing depth-relief fallback
