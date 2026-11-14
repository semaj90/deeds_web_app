Feature: Index and retrieve source-grounded evidence analysis
  As an investigator
  I want searchable analysis to retain exact evidence provenance
  So that each result can be authorized and reopened at its original source location

  Background:
    Given analysis results are derived from an admitted evidence revision

  Scenario: Analysis metadata is reconciled before multimodal vectors are written
    Given the existing evidence-vector contract is text-only
    When a worker produces an image or video-frame representation
    Then it does not write that representation as a text vector
    And it uses a separately versioned modality and preprocessing contract
    And no schema or migration change is applied outside an approved disposable rehearsal

  Scenario: Vector projection follows the canonical database and outbox path
    Given an approved source-bound analysis representation is ready for indexing
    When the worker commits the canonical representation
    Then PostgreSQL records its evidence ID, case, source revision, locator, model revision, and dimensions
    And a projection event is committed with the canonical record
    And Qdrant or TurboVec results remain rebuildable projections rather than evidence authority

  Scenario: Search returns only authorized current evidence with exact locators
    Given a case-scoped query matches a transcript, image region, or video frame
    When an authorized investigator searches that case
    Then each result includes its evidence revision and exact page, region, or timestamp locator
    And opening a result returns the same source revision that was indexed
    And retrieval similarity alone does not establish identity or prove a claim

  Scenario Outline: A rights-cleared exhibit remains traceable from admission to search
    Given I have a rights-cleared <modality> fixture and an authorized case
    When I admit it, process its available analysis stages, and search the case
    Then an independent readback matches the admitted source hash and revision
    And modality results and embeddings retain their source locator and model revision
    And the search result opens the exact page, image region, audio interval, or video timestamp
    When a user without case access requests the same result
    Then no result or evidence-existence information is disclosed

    Examples:
      | modality |
      | document |
      | image    |
      | audio    |
      | video    |

  Scenario: Unauthorized search does not disclose evidence or cached results
    Given I am not authorized for a case containing matching evidence
    When I search or request an analysis result for that case
    Then the request returns the application's not-found or denied response
    And no result, metadata, job state, cache hit, or existence signal is disclosed

  Scenario: Cached bundles are isolated by source and analysis revision
    Given a derived viewer bundle is cached for one evidence revision and analysis revision
    When a user requests another source revision or an incompatible analysis revision
    Then the cached bundle is not served as current
    And the response is loaded from the canonical owner or reports that matching results are unavailable
    And cache expiry or eviction does not remove canonical evidence or analysis records

  Scenario: Search projections reject stale source and model revisions
    Given a searchable projection was built from an older source or model revision
    When the current evidence revision is queried
    Then the stale projection is excluded or explicitly marked stale
    And the system does not silently substitute another source revision or embedding model

  Scenario: Approximate retrieval is evaluated against exact source-grounded results
    Given a frozen rights-cleared evaluation set has known relevant evidence IDs and locators
    When an approximate vector or quantized index is evaluated
    Then the report includes Recall@K, MRR, citation-location accuracy, latency, and memory
    And bounded exact rescore is compared on the same authorized candidate set
    And evaluation results do not by themselves promote a model or index to production

  Scenario: TurboQuant and TurboVec candidates use the same retrieval evaluation
    Given Qdrant quantization and the TurboVec challenger are both under consideration
    When each is measured against the frozen exact-rescore fixture
    Then both receive the same authorized candidates, queries, and source revisions
    And Recall@K, MRR, citation accuracy, latency, and memory are reported for each
    And neither candidate becomes a production projection without a reviewed promotion decision

  Scenario: Dataset lineage is required before evaluation or training use
    Given a legacy transcript, frame label, or behavior dataset lacks verified source reference, revision, hash, rights, or reviewer provenance
    When an evaluation or training cohort is assembled
    Then that item is excluded from the cohort
    And its exclusion reason is recorded
    And no inferred identity, intent, emotion, or guilt label is promoted as ground truth

  Scenario: Behavioral-event model evaluation preserves held-out source separation
    Given a rights-cleared, human-reviewed behavioral-event gold set is available
    When a classifier is evaluated
    Then train, validation, and test partitions are separated by person, case, and source
    And the report includes annotator agreement, class balance, quality slices, calibration, false positives, false negatives, and abstention
    And the classifier is not promoted solely from an aggregate score

  Scenario: Authorized initial state and later access revocation are respected
    Given I am authorized to view an evidence analysis page
    When the page is server-rendered and then hydrated
    Then the initial state contains only authorized case evidence
    And interactive review actions remain keyboard accessible
    When my case access is revoked while the page is open
    Then subsequent analysis and job-progress requests are denied
    And protected data is not returned through hydrated or cached state

  Scenario: Viewer texture levels never replace source pixels for analysis or export
    Given a high-resolution image or video frame has several viewer texture levels
    When the viewer streams a lower-resolution level for display
    Then the original source remains available at its admitted resolution
    And analysis observations retain coordinates in the original source space
    And an upscaled or scene-rendered derivative is labeled as derived
    And that derivative is not exported as original evidence
