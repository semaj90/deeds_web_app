## ADDED Requirements

### Requirement: Component analysis is revision-bound and read-only
The system SHALL analyze only a component selected from an authorized server-provided catalog rooted inside `sveltekit-frontend/src`, and SHALL bind each result to the workspace-relative source reference and SHA-256 digest of the exact source bytes analyzed. The system SHALL NOT write source files or persist analysis results.

#### Scenario: Analyze an authorized component
- **WHEN** an authorized admin selects a catalog component
- **THEN** the analyzer returns findings with the exact relative source reference and source digest
- **AND** no source, database, or cache write occurs

#### Scenario: Reject a path outside the component catalog
- **WHEN** a request supplies a path that was not returned by the authorized catalog or resolves outside its root
- **THEN** the server rejects the request without reading the requested file

#### Scenario: Invalidate findings after source changes
- **WHEN** the selected source bytes change after an analysis is produced
- **THEN** the prior findings are marked stale and are not presented as current

#### Scenario: Enforce source read limits
- **WHEN** a catalog component exceeds the configured source-size limit
- **THEN** the analyzer refuses the file with a stable, user-readable limit error and does not truncate it into a misleading analysis

### Requirement: Classifications are deterministic and evidence-backed
The system SHALL classify source-derived component roles and style values only when supported by explicit static source evidence. Each source finding SHALL include its source span and a reason; unsupported or ambiguous syntax SHALL be reported as `UNRESOLVED`. Optional model-generated visual labels SHALL be kept in a separate proposal channel and SHALL NOT be treated as source findings, human gold labels, or classification authority.

#### Scenario: Classify a component with explicit evidence
- **WHEN** a selected component contains supported structural and style signals
- **THEN** the analyzer returns deterministic role and style findings with source spans and explanatory reasons

#### Scenario: Abstain on dynamic or unsupported styles
- **WHEN** a component derives a class or color from unsupported dynamic syntax
- **THEN** the analyzer reports that portion as `UNRESOLVED` and does not invent a concrete value or role

#### Scenario: Replay identical source
- **WHEN** the same source bytes, analyzer version, and theme-token revision are analyzed twice
- **THEN** the normalized findings and digest are identical

#### Scenario: Keep optional VLM labels separate
- **WHEN** an admin explicitly requests visual analysis for a selected screenshot
- **THEN** the system returns structured model-proposed labels bound to the screenshot digest and provider/model revision
- **AND** deterministic source findings remain unchanged
- **AND** uncertain or unsupported labels can be `UNRESOLVED`

#### Scenario: Visual model is unavailable
- **WHEN** the configured local visual model/provider is unavailable or lacks screenshot-input capability
- **THEN** the visual analysis reports `VISUAL_MODEL_UNAVAILABLE`
- **AND** deterministic source analysis remains usable without loading or downloading a model

### Requirement: Palette comparisons remain advisory
The system SHALL compare observed colors and token references only with an identified existing YorHa theme-token source. Palette-role mappings and replacement suggestions SHALL be labeled as proposals. The system SHALL calculate contrast only when both foreground and background values are explicitly paired and SHALL identify the measured pair.

#### Scenario: Suggest a role using the existing token owner
- **WHEN** a literal source color can be compared to an identified YorHa theme token
- **THEN** the modal displays the observed value, suggested token role/value, source evidence, and proposal status

#### Scenario: Theme-token owner is unavailable
- **WHEN** the analyzer cannot resolve an approved theme-token source or its revision
- **THEN** palette mappings are reported as `UNRESOLVED` and no replacement token is created

#### Scenario: Contrast pair is explicit
- **WHEN** source evidence explicitly associates foreground and background values
- **THEN** the analyzer displays the pair and calculated contrast result without claiming page-level conformance

#### Scenario: Contrast pair is not explicit
- **WHEN** no explicit foreground/background relationship is found
- **THEN** contrast is shown as `NOT_COMPUTED`

### Requirement: Visual similarity uses an isolated proposal representation
When enabled, the system SHALL use EmbeddingGemma 2 only for opt-in image-to-image or image-to-text style similarity, SHALL identify the representation as `visual_style_embedding_768`, and SHALL bind every score to the model artifact revision and input digests. It SHALL NOT write these vectors to the canonical `semantic_768` representation or its retrieval index, persist vectors in v1, or treat similarity as a correctness, identity, accessibility, or authorization decision.

#### Scenario: Compare a selected screenshot with bounded references
- **WHEN** an admin explicitly requests visual similarity and the configured adapter confirms image-input support
- **THEN** the system returns ranked reference candidates with model revision, screenshot/reference digests, and similarity scores
- **AND** labels the ranking as advisory visual similarity

#### Scenario: Reject a canonical-lane substitution
- **WHEN** a caller attempts to register or persist a visual-style vector as canonical `semantic_768`
- **THEN** the request is rejected without writing to the canonical embedding store or index

#### Scenario: Enforce bounded optional execution
- **WHEN** a screenshot exceeds configured byte/dimension limits or the model exceeds its time budget
- **THEN** the request returns a stable bounded error and leaves deterministic analysis available

### Requirement: The review modal is accessible and cannot apply changes
The system SHALL present findings in an accessible Bits UI v2 dialog using the existing Svelte 5 and UnoCSS stack. The dialog SHALL provide Structure, Styles, Palette, and Findings views, preserve keyboard and focus behavior, and SHALL offer copy-only proposed output without a file-apply action.

#### Scenario: Navigate the dialog by keyboard
- **WHEN** an admin opens and navigates the analyzer dialog using a keyboard
- **THEN** focus remains managed by the dialog, each view and control has an accessible name, and closing restores focus to the trigger

#### Scenario: Copy a proposed diff
- **WHEN** an admin copies a proposed palette diff
- **THEN** the proposal is copied as text and no file or database write is initiated

#### Scenario: Respect reduced motion and narrow viewports
- **WHEN** reduced-motion preference is enabled or the viewport is narrow
- **THEN** the dialog remains usable without required animation and its findings remain reachable without horizontal page overflow
