Feature: Reach source-grounded evidence analysis from a case
  As an investigator
  I want to open analysis from the evidence attached to my case
  So that analysis, timestamps, and citations stay tied to the original exhibit

  Background:
    Given I am signed in as a user authorized to work on the case

  Scenario: A newly created case opens its overview
    Given I am completing the new case form with valid case details
    When I create the case
    Then I arrive at that case's Overview page
    And the case navigation offers the Evidence Board

  Scenario: An empty case guides me to add evidence
    Given the case has no evidence
    When I open the case's Evidence Board
    Then I see an empty state explaining that no exhibits are attached
    And I can choose Add Evidence without leaving the case

  Scenario: I open analysis for an uploaded exhibit
    Given an exhibit has finished processing for this case
    When I select the exhibit from the Evidence Board
    Then I can see its source identity, revision, and processing status
    And I can open analysis for that exhibit
    And the analysis view identifies the same case and exhibit

  Scenario: Processing progress survives a page refresh
    Given an exhibit upload has created a durable analysis job
    When I open the exhibit's processing view
    Then I can distinguish upload progress from analysis progress
    And I can see the current processing stage and last known status
    When I refresh the page while processing is still running
    Then the view resumes from the durable job status
    And it does not create a duplicate analysis job

  Scenario: Processing progress resumes after a stream disconnect
    Given an authorized analysis progress stream has delivered events through a saved cursor
    When the browser disconnects and reconnects with that cursor
    Then it receives later events in order without replaying them as new results
    And the stream rechecks case authorization before sending protected progress
    And progress events contain status and stage information without raw evidence content

  Scenario: A silent video is analyzed without starting transcription
    Given I uploaded a valid video that has no audio stream
    When the media probe completes
    Then frame analysis can continue
    And transcription is marked as skipped because no audio stream exists
    And the overall job does not fail solely because the video is silent

  Scenario: Video findings and transcript navigate to their source time
    Given a processed video exhibit has timestamped frame findings and transcript segments
    When I select a frame finding or transcript segment
    Then the player seeks to the source presentation timestamp for that result
    And the selected finding or transcript segment is highlighted
    And the result shows the source evidence revision and analysis revision
    And each model result remains labeled as an unreviewed proposal until reviewed

  Scenario: Object detections do not claim a person's identity
    Given a video frame has a model detection labeled person
    When I inspect the detection
    Then I see its source timestamp and source-space bounding box
    And the label is presented as a non-identifying model observation
    And the detection is not presented as a confirmed identity

  Scenario: An investigator reviews a model finding
    Given an analysis finding is awaiting review
    When I accept, reject, or correct the finding
    Then the review decision is saved separately from the model output
    And the decision records the reviewer and review time
    And the original evidence bytes remain unchanged

  Scenario: A source revision change makes earlier analysis stale
    Given an exhibit has completed analysis for source revision one
    When a new immutable source revision is admitted for the exhibit
    Then revision one's analysis is not shown as current for revision two
    And revision two is queued or clearly marked as not yet analyzed
    And existing citations to revision one continue to identify revision one

  Scenario: Cached analysis cannot cross source revisions
    Given analysis results are cached for one evidence revision
    When I open a different revision of the same exhibit
    Then results from the earlier revision are not presented as current
    And the view loads results qualified for the selected revision or shows that they are unavailable

  Scenario: Stored evidence remains available when analysis fails
    Given the original exhibit was durably uploaded
    And its analysis job failed
    When I open the exhibit
    Then I see that upload succeeded and analysis failed as separate statuses
    And I can inspect the failure or retry the analysis
    And the original exhibit remains unchanged

  Scenario: A retry resumes safely after a worker interruption
    Given a media analysis worker stopped after storing some derived results
    When the job is retried
    Then existing results for the same source and processing revision are not duplicated
    And processing resumes or safely recomputes the incomplete stage
    And the job reaches a visible terminal status

  Scenario: Case authorization is enforced when opening analysis
    Given I am not authorized to access the case
    When I request the exhibit analysis page directly
    Then I receive the application's not-found response
    And no exhibit details, analysis results, or job progress are disclosed
