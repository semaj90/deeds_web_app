## ADDED Requirements

### Requirement: Case-routing suggestions remain separate from evidence ranking
The Analysis Center SHALL expose an isolated case-routing suggestion contract for "Did you mean?"
guidance. The contract SHALL consume only the active case, the routing trigger, and the server's
authorized case choices. It SHALL NOT reuse the contextual engineering candidate ranker as a case
ranker, alter SearchRuntime ordering, create evidence findings, or grant case access.

#### Scenario: Search or analysis has no eligible source
- **WHEN** a case-scoped search returns no results or analysis abstains for lack of eligible sources
- **THEN** the UI MAY show a bounded set of other cases already authorized for the actor, clearly
  labeled as navigation suggestions and requiring an explicit user selection

#### Scenario: No authorized alternative exists
- **WHEN** the authorized case list contains no alternative to the active case
- **THEN** the UI SHALL offer the existing case-creation route or let the user keep the current
  scope, without fabricating a case recommendation

### Requirement: Suggestion providers cannot widen authorization
A suggestion provider MAY order or select candidate IDs only from the authorized candidate set it
receives. The server SHALL discard unknown IDs and re-check authorization when a suggested case is
selected. Provider output SHALL NOT cause automatic case switching.

#### Scenario: Provider returns an unknown or unauthorized case ID
- **WHEN** a suggestion provider returns an ID absent from the authorized candidate set
- **THEN** the server/UI SHALL omit that suggestion and retain the current case scope

### Requirement: Suggestion routing is modular and replaceable
The pure routing policy SHALL be separate from the Bits UI dialog and from Analysis Center form
actions. The dialog SHALL receive typed suggestion data and callbacks for selecting a case, creating
a case, or keeping the current scope. The default provider SHALL be deterministic. Any later
assistant-backed provider SHALL use admitted, case-authorized context and SHALL be independently
evaluated before promotion.

#### Scenario: The recommendation provider is unavailable
- **WHEN** an optional assistant-backed provider times out or is unavailable
- **THEN** the deterministic routing guidance SHALL remain usable and SHALL NOT block evidence
  search, analysis abstention, or case creation

### Requirement: New-case handoff reuses the canonical case owner
Creating a case from routing guidance SHALL reuse the existing authenticated `/cases/new` action and
its schema. Returning to Analysis Center SHALL use a fixed allowlisted destination, and the page
SHALL select the new case only after the server confirms that the actor can access it.

#### Scenario: Case creation returns to Analysis Center
- **WHEN** an authenticated user creates a case from the Analysis Center routing flow
- **THEN** the existing case action SHALL redirect to Analysis Center with the created case selected
  only after authorization, while ordinary case creation SHALL retain its existing destination
