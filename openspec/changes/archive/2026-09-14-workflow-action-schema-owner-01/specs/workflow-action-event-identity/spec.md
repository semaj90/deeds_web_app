## ADDED Requirements

### Requirement: Single canonical WorkflowActionEventV1 schema
Exactly one schema module SHALL define the `WorkflowActionEventV1` shape and validate the
`atlas.workflow-action.v1` schema identity: `packages/parent-atlas/src/core/workflow-action-event.ts`.
No other module in the repository SHALL declare its own `z.object` (or equivalent) schema whose
`schema` field is the literal `'atlas.workflow-action.v1'`. Modules that need a subsystem-specific
shape SHALL keep their own local type under a different name and convert to/from the canonical
shape via an explicit adapter function.

#### Scenario: A subsystem needs to represent a workflow action event
- **WHEN** a subsystem (UI/Kanban, the agentic file compiler, or the context-tool DAG builder)
  needs to represent a workflow action event
- **THEN** it SHALL import `workflowActionEventSchema` / `WorkflowActionEventV1` from
  `@deeds/parent-atlas/core/workflow-action-event` for canonical identity, and MAY additionally
  keep its own local, differently-named type for fields the canonical schema does not carry

#### Scenario: A second schema claims the same identity literal
- **WHEN** a code review or automated audit finds a `z.literal('atlas.workflow-action.v1')` (or
  equivalent) declared in a schema object outside `packages/parent-atlas/src/core/workflow-action-event.ts`
- **THEN** that declaration SHALL be treated as a violation of this requirement and converted into
  an adapter against the canonical schema, not left as an independent competing definition

### Requirement: Canonical schema is a lossless superset of prior subsystem shapes
The canonical `workflowActionEventSchema` SHALL be capable of losslessly representing every field
that was in real use by any of the four pre-convergence definitions identified in this change's
proposal (resource-ref/evidence-checksum fields, UI presentation fields, compiler-lifecycle
fields, and DAG-execution fields), with all newly added fields optional so existing valid
constructions of the schema remain valid.

#### Scenario: An adapter converts a subsystem shape to canonical and back
- **WHEN** a subsystem's adapter converts its local shape to the canonical
  `WorkflowActionEventV1` and then converts the result back to its local shape
- **THEN** every field the subsystem actually reads from its local shape SHALL be preserved
  exactly (round-trip lossless for the subsystem's real usage surface)

#### Scenario: An existing canonical-schema construction site is unaffected
- **WHEN** an existing file in `packages/parent-atlas/src/core/` (e.g. `workflow-action-adapters.ts`)
  constructs a `WorkflowActionEventV1` using only fields that existed before this change
- **THEN** that construction SHALL continue to validate successfully against the extended schema
  with no changes required to the constructing file

### Requirement: Completion and failure invariants remain enforced
The canonical schema SHALL continue to require `receiptId` when `kind` is `'completed'` and
`errorCode` when `kind` is `'failed'`, and SHALL additionally require that an embedded `checksum`
field (if present) agrees with any externally computed receipt checksum for the same event.

#### Scenario: A completed event without a receiptId is rejected
- **WHEN** a `WorkflowActionEventV1` is constructed with `kind: 'completed'` and no `receiptId`
- **THEN** schema validation SHALL fail

#### Scenario: A failed event without an errorCode is rejected
- **WHEN** a `WorkflowActionEventV1` is constructed with `kind: 'failed'` and no `errorCode`
- **THEN** schema validation SHALL fail

#### Scenario: Embedded checksum disagrees with the externally computed receipt checksum
- **WHEN** a `WorkflowActionEventV1` carries an embedded `checksum` field and a separately
  computed `workflowActionEventReceiptSchema.event_checksum` is produced for the same event, and
  the two values differ
- **THEN** validation of that pairing SHALL fail rather than silently preferring one value
