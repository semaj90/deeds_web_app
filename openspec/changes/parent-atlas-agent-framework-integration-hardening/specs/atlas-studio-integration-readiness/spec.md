## ADDED Requirements

### Requirement: Studio integration readiness is evidence-backed
Parent Atlas Studio SHALL render integration status from read-only descriptors and source receipts. Each integration SHALL identify its owner, role, protocol or framework, availability state, evidence level, last-verified revision/time, blocker, and next proof gate. Missing or stale evidence SHALL NOT be displayed as verified.

#### Scenario: Integration has only a package dependency
- **WHEN** a framework package is installed but no runtime registration or live receipt exists
- **THEN** Studio SHALL show the integration as discovered or configured, not live-verified

#### Scenario: Evidence is stale or unavailable
- **WHEN** the source receipt is stale, missing, malformed, or its service is unreachable
- **THEN** Studio SHALL show a stable degraded/unavailable state and the missing proof without throwing or implying success

### Requirement: Studio integration status is read-only
The readiness view SHALL NOT dispatch agents, invoke tools, mutate canonical Atlas state, hydrate caches, or change feature/task completion. Administrative actions SHALL use existing authorization and separately registered execution paths.

#### Scenario: Operator opens readiness view
- **WHEN** an authorized operator loads the integration readiness view
- **THEN** the view SHALL read descriptors and receipts only and SHALL report that no writes or dispatches were performed

#### Scenario: User requests an execution action from readiness status
- **WHEN** a readiness card is selected or inspected
- **THEN** status inspection SHALL NOT itself invoke the integration; any execution SHALL require an existing explicit authorized tool path

### Requirement: Integration concepts link to owners without granting permission
Studio and its documentation links SHALL map discovery terms including `search`, `multi-hop`, `LUT`, `corpus`, `glossary`, `backend`, `ACP`, `A2A`, `MCP`, `OpenWiki`, and `Kanban` to their owning components. These aliases and links SHALL NOT act as authorization, canonical identity, or evidence promotion.

#### Scenario: Operator searches by an alias
- **WHEN** an operator searches an integration term such as `LUT` or `multi-hop`
- **THEN** Studio SHALL return owner and documentation links with the projection/evidence boundary clearly identified
