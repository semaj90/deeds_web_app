## ADDED Requirements

### Requirement: Integration task state is projected from canonical evidence
The Kanban/task-board integration view SHALL derive task status from existing canonical feature, state, and evidence owners. Framework reports, Studio display state, OpenWiki pages, and manually edited task text SHALL NOT independently mark an integration verified or a task done.

#### Scenario: Integration proof is incomplete
- **WHEN** implementation exists but required runtime, authorization, or independent readback evidence is missing
- **THEN** the projected task SHALL remain in an evidence-needed, implementing, or verify state rather than verified/done

#### Scenario: A proof receipt becomes stale
- **WHEN** the source revision or integration contract changes after a proof receipt was created
- **THEN** the board SHALL flag the evidence as stale and SHALL NOT count it as current completion evidence

### Requirement: Integration dependencies are navigable without changing task identity
The board MAY link framework integrations, protocol owners, MCP capabilities, OpenWiki references, and Studio readiness cards. Such links SHALL preserve canonical feature/task identity and SHALL NOT alter priority, completion, or authorization by themselves.

#### Scenario: Operator follows an integration link
- **WHEN** an operator opens a framework or protocol link from a task card
- **THEN** the board SHALL retain the same task identity and evidence status
