## ADDED Requirements

### Requirement: Depth artifacts are source-bound and byte-verified
The system SHALL serve a depth artifact as evidence-derived depth only when an authorized manifest binds it to the requested evidence identity, exact source SHA-256 and revision, source frame identity where applicable, source dimensions, depth SHA-256 and dimensions, and model revision. The system SHALL verify the retrieved artifact bytes against the recorded depth digest and validate the decoded image dimensions before rendering it as stored depth.

#### Scenario: Valid stored depth artifact
- **WHEN** an authorized user requests a depth artifact whose manifest matches the current evidence source and whose retrieved bytes match the recorded digest and dimensions
- **THEN** the route returns the verified artifact and its source/depth revision metadata

#### Scenario: Stale or mismatched depth artifact
- **WHEN** the source digest, source revision, frame identity, depth digest, or dimensions do not match the current evidence binding
- **THEN** the system rejects the artifact as stored depth and the viewer shows the original image or an explicitly labeled preview without implying measured depth

#### Scenario: Unauthorized depth access
- **WHEN** a caller lacks current authorization for the evidence and its case
- **THEN** the route returns the stable not-found/unauthorized response without disclosing object existence or artifact metadata

### Requirement: Relief markers use stable source coordinates
The system SHALL represent each relief marker using normalized source-image coordinates `u` and `v` in the inclusive range `[0,1]`, and SHALL resolve its displayed surface position from the currently verified relief geometry. Marker anchors SHALL NOT be stored as triangle indices or camera-dependent world coordinates.

#### Scenario: Marker remains attached across geometry changes
- **WHEN** a marker is displayed after relief strength or geometry LOD changes while the source/depth binding remains the same
- **THEN** the marker remains anchored to the same source-image location and is projected onto the active surface

#### Scenario: Invalid coordinates
- **WHEN** a marker write contains non-finite coordinates or coordinates outside `[0,1]`
- **THEN** the write is rejected and no annotation state is changed

### Requirement: Relief annotations are authorized and revision-bound
The system SHALL persist relief annotations in the canonical PostgreSQL owner with evidence ID, case ID, source digest/revision, depth artifact digest/revision, normalized coordinates, annotation content, actor, and an optimistic concurrency revision. Every read and write SHALL enforce current case/evidence authorization and SHALL reject stale source or depth bindings.

#### Scenario: Authorized annotation save and readback
- **WHEN** an authorized user saves an annotation against the current verified source/depth binding with the expected annotation revision
- **THEN** PostgreSQL stores the annotation and an independent readback returns the exact binding, coordinates, content, actor, and new revision

#### Scenario: Concurrent edit conflict
- **WHEN** an annotation update supplies an expected revision older than the current stored revision
- **THEN** the system returns a conflict with the current revision and preserves the current annotation unchanged

#### Scenario: Source or depth changed after annotation creation
- **WHEN** a read or write encounters a source digest/revision or depth artifact digest/revision different from the annotation binding
- **THEN** the annotation is not silently rebound or shown as current and the operation returns a stale-binding conflict

#### Scenario: Duplicate retry
- **WHEN** the same authorized mutation is retried with the same idempotency key and request digest
- **THEN** the system returns the original result without creating a duplicate annotation or revision

### Requirement: End-to-end annotation proof uses real dependencies
The implementation SHALL provide an isolated integration path that exercises PostgreSQL persistence/readback and the configured S3-compatible SeaweedFS artifact path without replacing those dependencies with mocks. Mutating integration tests SHALL target an explicitly disposable database and isolated test object prefix, and SHALL restrict cleanup to resources created by that test. The live application database and evidence bucket SHALL remain read-only unless separately authorized.

#### Scenario: Disposable dependency integration
- **WHEN** the integration suite is configured with an explicitly allowlisted disposable PostgreSQL database and isolated SeaweedFS prefix
- **THEN** it verifies authorized save/readback, byte-digest binding, stale/mismatched rejection, unauthorized access, duplicate retry, and optimistic concurrency against those real dependencies

#### Scenario: No safe disposable target
- **WHEN** the suite cannot prove its database and object prefix are disposable and isolated
- **THEN** it fails closed before performing any write

#### Scenario: Browser round trip
- **WHEN** an authenticated browser opens a real test evidence item, renders its matching verified depth artifact, edits a marker, saves, closes, and reopens it
- **THEN** the marker is recovered at the same source coordinates, invalid bindings are rejected, and the browser reports no page/console errors or retained renderer resources after close
