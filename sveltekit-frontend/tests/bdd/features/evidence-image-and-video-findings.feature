Feature: Review image and video analysis findings in their source context
  As an investigator
  I want model observations to open at the exact source image or video time
  So that I can verify, correct, or reject them against the original evidence

  Background:
    Given I am signed in as a user authorized for the evidence case
    And the evidence viewer has loaded the authorized source revision

  Scenario: An image finding points to the original image region
    Given an admitted image has OCR or object-detection observations
    When I select an observation in the analysis sidebar
    Then the viewer opens the original image revision
    And the observation highlights its source-coordinate region
    And the observation shows its model and preprocessing revisions

  Scenario: A document citation resolves to its exact page and text span
    Given a processed document has extracted text with source offsets
    When I open a citation from its analysis result
    Then the document viewer opens the cited page and exact source span
    And the displayed text matches the canonical source slice
    And character offsets and UTF-8 byte offsets resolve to the same text

  Scenario: A video detection maps its box back to source-frame coordinates
    Given a selected video frame was resized or letterboxed for detection
    When the detector returns a bounding box
    Then the stored box is mapped to the original frame dimensions
    And the observation retains the frame timestamp, source revision, and detector revision
    And invalid or out-of-bounds coordinates are rejected

  Scenario: A generic person label does not identify a person
    Given a detector labels a region as person
    When I view the detection
    Then it is described only as a non-identifying model observation
    And the interface does not infer a person's identity from the label or embedding similarity

  Scenario: Face detection does not perform identity matching
    Given an image or video contains a detected face region
    When the analysis pipeline records or displays that region
    Then it does not create an identity template or search a person-of-interest gallery
    And it does not link a person identity across evidence items or cases
    And any future identity-matching capability requires separate policy and review

  Scenario: dHash is shown only as a frame-similarity clue
    Given two frames have matching or nearby perceptual hashes
    When the analysis results are displayed
    Then the hash result may help group or deduplicate frames
    But it is not shown as proof of source identity, event identity, or claim truth
    And source integrity is determined by the admitted source hash and revision

  Scenario: VLM OCR and captions remain reviewable proposals
    Given a selected frame has OCR text or a generated caption
    When I inspect the result
    Then it is linked to the exact frame and source revision
    And its model and prompt or processing revision are visible
    And its review state is clearly shown as unreviewed until a reviewer acts

  Scenario: VLM frame selection respects the combined input budget
    Given text, selected frames, and output must share a configured model input budget
    When the worker prepares a VLM request
    Then the combined estimated input stays within the configured budget
    And frames are reduced according to the versioned sampling policy when necessary
    And omitted frames are not represented as analyzed

  Scenario Outline: A reviewer decision is recorded separately from model output
    Given an image or video finding is unreviewed
    When I <decision> the finding
    Then the original model output remains preserved
    And the reviewer decision, reviewer identity, time, and source revision are recorded
    And the original evidence bytes are unchanged

    Examples:
      | decision |
      | accept   |
      | reject   |
      | correct  |

  Scenario: Behavioral annotations describe observable actions only
    Given an investigator adds a behavioral event label to a media time range
    When the label is saved
    Then it records the observable action, source interval, uncertainty, and reviewer disposition
    And it does not label intent, emotion, guilt, or identity as an observed fact

  Scenario: Selecting a timeline result seeks to its source presentation time
    Given the viewer shows timestamped transcript and frame findings
    When I select a result
    Then playback seeks using the source presentation timestamp and stream time base
    And the selected transcript interval or frame marker is highlighted
    And the displayed timecode is a presentation of that source time, not a replacement locator
