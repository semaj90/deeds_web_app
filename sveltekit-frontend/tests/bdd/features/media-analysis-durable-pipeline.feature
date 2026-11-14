Feature: Process admitted media through the durable evidence pipeline
  As an investigator
  I want image, audio, and video analysis to run as durable source-bound jobs
  So that processing can recover without altering admitted evidence

  Background:
    Given I am signed in as a user authorized for the case
    And the case accepts evidence uploads

  Scenario: Admission records the verified source before analysis starts
    Given I have a supported image, audio, or video file
    When I upload it to the case
    Then the server verifies its file signature, detected media type, size, and source hash
    And admission records its rights and consent status when applicable
    And the server binds the authenticated actor, authorized case, requested analysis, and resource budget
    And the original bytes are stored unchanged
    And the evidence revision and queued analysis job refer to that same source hash
    And an independent readback confirms the stored bytes and hash
    And the upload response does not claim that analysis has completed

  Scenario: Repeating an admission request does not create duplicate evidence or jobs
    Given I submitted an evidence upload with an idempotency key
    When the same request is retried after a network timeout
    Then the system returns the existing admitted evidence revision and job
    And it does not create a duplicate source object or analysis job

  Scenario: A cross-case upload is rejected before storage or processing
    Given I am authorized for one case but submit a different case identifier
    When I attempt to register evidence in that other case
    Then the request is denied without storing an object or creating an analysis job
    And the response does not disclose whether evidence in the other case exists

  Scenario: A worker rechecks authorization and source revision when claiming a job
    Given an analysis job was queued for a specific case and source revision
    And that case access was revoked or the active source revision changed
    When a worker claims the job
    Then processing is refused or fenced from publishing results
    And no result for the stale or unauthorized source is marked current

  Scenario: A media probe has bounded time and handles malformed input
    Given an admitted media file is corrupt or its probe exceeds the configured timeout
    When the worker probes the source
    Then the stage ends with a bounded, visible failure
    And the worker can be cancelled or retried safely
    And the original stored object remains available and unchanged

  Scenario: A silent video skips audio extraction and continues visual analysis
    Given an admitted video has no audio stream
    When the worker probes its streams
    Then audio extraction and transcription are marked skipped with a reason
    And frame analysis continues
    And the overall job can complete successfully

  Scenario: An audio-bearing video produces source-timed transcript segments
    Given an admitted video has an audio stream
    When the worker extracts audio and transcription completes
    Then each transcript segment has a start and end time tied to the video source revision
    And language and speaker labels retain their uncertainty and model revision
    And transcript output is not treated as a human-verified statement

  Scenario: Standalone audio produces a transcript linked to the original recording
    Given I uploaded an admitted MP3, WAV, or FLAC recording
    When the worker probes and transcribes the audio
    Then transcript segments retain start and end times in the recording's time base
    And the original audio remains playable and unchanged
    And any normalized audio used for transcription is stored as a derived artifact

  Scenario: Transcript correction preserves the model output and audio locator
    Given an audio transcript segment has a possible recognition or speaker error
    When an investigator corrects the segment
    Then the correction is stored as a reviewed revision linked to the same source time range
    And the original model transcript remains available for audit

  Scenario: An unavailable analysis model cannot produce fabricated success
    Given a required embedding, transcription, or vision runtime is unavailable
    When the worker reaches that analysis stage
    Then the stage reports blocked or failed with a specific reason
    And no placeholder, hash-derived, or stale model output is recorded as a successful result
    And already admitted source evidence remains available

  Scenario: A transcription timeout does not stall other eligible video stages
    Given a video has both audio and video streams
    When transcription exceeds its configured timeout
    Then the transcript stage ends with a visible timeout status
    And eligible frame-analysis stages continue or complete independently
    And the overall job reports partial failure rather than claiming transcription succeeded

  Scenario: Frame sampling is deterministic and stays within its declared budget
    Given a video has a versioned frame-sampling policy and resource budget
    When the worker samples frames
    Then selected frames have source timestamps, dimensions, and extraction-policy revision
    And the worker records omitted intervals when limits prevent full temporal coverage
    And zero-frame, exact-budget, over-budget, repeated-scene, and malformed-timestamp inputs fail or complete according to the policy

  Scenario: Frame sampling cancellation records omissions and releases the worker lease
    Given a video sampling job has duration, frame, dimension, byte, runtime, and token budgets
    When an investigator cancels the job or its lease expires
    Then the worker stops within the configured cancellation bound
    And the job records completed and omitted source intervals
    And a later retry can resume without publishing partial results as complete
    And the worker lease is available for safe recovery

  Scenario: Modality stages are independently retryable with CPU fallback
    Given an admitted evidence item requires more than one analysis stage
    When extraction, transcription, vision, or indexing is retried
    Then each stage is idempotent and records its own status and revision
    And CPU processing remains a supported path
    And GPU processing runs only after admission by the existing resource policy
    And GPU unavailability does not cause fabricated success or corrupt CPU results

  Scenario: Stored frame derivatives can be independently read back
    Given the worker selected timestamped video frames
    When it stores frame derivatives and commits frame metadata
    Then each derivative can be read back from object storage with its expected hash
    And PostgreSQL metadata points to the same evidence revision, frame, and timestamp
    And the original video hash still matches its admission receipt

  Scenario: A worker interruption can be retried without duplicate results
    Given a worker stopped after writing some outputs for an analysis stage
    When the durable job is reclaimed and retried
    Then completed outputs for the same source and processing revision are reused or idempotently replaced
    And incomplete outputs are resumed or safely recomputed
    And outputs from a different source revision are never overwritten

  Scenario: Object-store or database readback failure blocks successful completion
    Given an analysis stage wrote a derived object or database record
    When independent readback finds a missing object, hash mismatch, or incomplete metadata
    Then the job is not marked completed
    And the failure is visible and retryable according to policy
    And the admitted original remains unchanged

  Scenario: Exhausted retries are quarantined without discarding evidence
    Given a media stage has exhausted its allowed retry attempts
    When the job is moved to its terminal retry-exhausted state
    Then the failure and source revision remain inspectable by an authorized operator
    And the job is not silently dropped or reported as completed
    And the admitted original and verified partial outputs remain available for review
