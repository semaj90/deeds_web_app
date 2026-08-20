import { z } from 'zod';
import {
  evidenceEntityFactSchema,
  type EvidenceEntityExtractorV1,
  type EvidenceEntityFactV1,
  type EvidenceExtractionInputV1,
} from './evidence-entity-backfill.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const confidence = z.number().finite().min(0).max(1);
const canonical = z.literal('canonical');

const canonicalEntitySchema = z.object({
  entity_type: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  entity_id: id,
  identity_status: canonical,
  role: z.string().min(1),
  confidence: confidence.default(1),
}).strict();

export const schemaEvidencePayloadSchema = z.object({
  schema: z.literal('atlas.schema-evidence.v1'),
  schema_revision: revision,
  tables: z.array(z.object({
    table_id: id,
    identity_status: canonical,
    columns: z.array(z.object({ column_id: id, identity_status: canonical }).strict()).default([]),
    foreign_keys: z.array(z.object({ foreign_key_id: id, identity_status: canonical }).strict()).default([]),
    indexes: z.array(z.object({ index_id: id, identity_status: canonical }).strict()).default([]),
    policies: z.array(z.object({ policy_id: id, identity_status: canonical }).strict()).default([]),
  }).strict()).default([]),
}).strict();

export const testEvidencePayloadSchema = z.object({
  schema: z.literal('atlas.test-evidence.v1'),
  test_revision: revision,
  test_id: id,
  identity_status: canonical,
  target: canonicalEntitySchema.optional(),
  assertions: z.array(z.object({
    assertion_id: id,
    identity_status: canonical,
    target: canonicalEntitySchema.optional(),
  }).strict()).default([]),
  runtime_receipt: z.object({
    receipt_id: id,
    identity_status: canonical,
    status: z.enum(['passed', 'failed', 'skipped', 'error']),
  }).strict().optional(),
}).strict();

export const openSpecEvidencePayloadSchema = z.object({
  schema: z.literal('atlas.openspec-evidence.v1'),
  document_revision: revision,
  requirements: z.array(z.object({ requirement_id: id, identity_status: canonical }).strict()).default([]),
  scenarios: z.array(z.object({ scenario_id: id, identity_status: canonical, requirement_id: id.optional() }).strict()).default([]),
  tasks: z.array(z.object({ task_id: id, identity_status: canonical, requirement_id: id.optional(), scenario_id: id.optional() }).strict()).default([]),
}).strict();

export const runtimeEvidencePayloadSchema = z.object({
  schema: z.literal('atlas.runtime-evidence.v1'),
  runtime_revision: revision,
  tool: z.object({ tool_id: id, identity_status: canonical }).strict().optional(),
  action: z.object({ action_id: id, identity_status: canonical }).strict().optional(),
  receipt: z.object({ receipt_id: id, identity_status: canonical }).strict().optional(),
  resources: z.array(z.object({
    resource_type: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
    resource_id: id,
    identity_status: canonical,
    role: z.string().min(1).default('resource'),
  }).strict()).default([]),
}).strict();

export type SchemaEvidencePayloadV1 = z.infer<typeof schemaEvidencePayloadSchema>;
export type TestEvidencePayloadV1 = z.infer<typeof testEvidencePayloadSchema>;
export type OpenSpecEvidencePayloadV1 = z.infer<typeof openSpecEvidencePayloadSchema>;
export type RuntimeEvidencePayloadV1 = z.infer<typeof runtimeEvidencePayloadSchema>;

function fact(input: EvidenceExtractionInputV1, entityType: string, entityId: string, role: string, producerRevision: string, value = 1): EvidenceEntityFactV1 {
  return evidenceEntityFactSchema.parse({
    evidence_id: input.evidence_id,
    evidence_revision: input.evidence_revision,
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    entity_type: entityType,
    entity_id: entityId,
    role,
    confidence: value,
    producer_revision: producerRevision,
  });
}

function dedupeFacts(values: EvidenceEntityFactV1[]): EvidenceEntityFactV1[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.evidence_id}\0${value.entity_type}\0${value.entity_id}\0${value.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** PostgreSQL/schema-registry facts. IDs must already be canonical. */
export function extractSchemaEvidenceEntities(input: EvidenceExtractionInputV1, producerRevision: string): EvidenceEntityFactV1[] {
  const payload = schemaEvidencePayloadSchema.parse(input.payload);
  const facts: EvidenceEntityFactV1[] = [];
  for (const table of payload.tables) {
    facts.push(fact(input, 'table', table.table_id, 'schema_table', producerRevision));
    for (const column of table.columns) facts.push(fact(input, 'column', column.column_id, 'schema_column', producerRevision));
    for (const fk of table.foreign_keys) facts.push(fact(input, 'foreign_key', fk.foreign_key_id, 'schema_foreign_key', producerRevision));
    for (const index of table.indexes) facts.push(fact(input, 'index', index.index_id, 'schema_index', producerRevision));
    for (const policy of table.policies) facts.push(fact(input, 'database_policy', policy.policy_id, 'schema_policy', producerRevision));
  }
  return dedupeFacts(facts);
}

/** Test definitions and revisioned runtime results remain distinct evidence roles. */
export function extractTestEvidenceEntities(input: EvidenceExtractionInputV1, producerRevision: string): EvidenceEntityFactV1[] {
  const payload = testEvidencePayloadSchema.parse(input.payload);
  const facts: EvidenceEntityFactV1[] = [fact(input, 'test', payload.test_id, 'test_definition', producerRevision)];
  if (payload.target) facts.push(fact(input, payload.target.entity_type, payload.target.entity_id, payload.target.role, producerRevision, payload.target.confidence));
  for (const assertion of payload.assertions) {
    facts.push(fact(input, 'assertion', assertion.assertion_id, 'test_assertion', producerRevision));
    if (assertion.target) facts.push(fact(input, assertion.target.entity_type, assertion.target.entity_id, assertion.target.role, producerRevision, assertion.target.confidence));
  }
  if (payload.runtime_receipt) {
    facts.push(fact(input, 'runtime_receipt', payload.runtime_receipt.receipt_id, `test_result:${payload.runtime_receipt.status}`, producerRevision));
  }
  return dedupeFacts(facts);
}

/** OpenSpec parser owns requirement/scenario/task IDs; this adapter never hashes prose into IDs. */
export function extractOpenSpecEvidenceEntities(input: EvidenceExtractionInputV1, producerRevision: string): EvidenceEntityFactV1[] {
  const payload = openSpecEvidencePayloadSchema.parse(input.payload);
  const facts: EvidenceEntityFactV1[] = [];
  for (const requirement of payload.requirements) facts.push(fact(input, 'requirement', requirement.requirement_id, 'openspec_requirement', producerRevision));
  for (const scenario of payload.scenarios) {
    facts.push(fact(input, 'scenario', scenario.scenario_id, 'openspec_scenario', producerRevision));
    if (scenario.requirement_id) facts.push(fact(input, 'requirement', scenario.requirement_id, 'scenario_requirement', producerRevision));
  }
  for (const task of payload.tasks) {
    facts.push(fact(input, 'task', task.task_id, 'openspec_task', producerRevision));
    if (task.requirement_id) facts.push(fact(input, 'requirement', task.requirement_id, 'task_requirement', producerRevision));
    if (task.scenario_id) facts.push(fact(input, 'scenario', task.scenario_id, 'task_scenario', producerRevision));
  }
  return dedupeFacts(facts);
}

/** Runtime/tool execution identities must come from revisioned execution receipts. */
export function extractRuntimeEvidenceEntities(input: EvidenceExtractionInputV1, producerRevision: string): EvidenceEntityFactV1[] {
  const payload = runtimeEvidencePayloadSchema.parse(input.payload);
  const facts: EvidenceEntityFactV1[] = [];
  if (payload.tool) facts.push(fact(input, 'tool', payload.tool.tool_id, 'runtime_tool', producerRevision));
  if (payload.action) facts.push(fact(input, 'action', payload.action.action_id, 'runtime_action', producerRevision));
  if (payload.receipt) facts.push(fact(input, 'runtime_receipt', payload.receipt.receipt_id, 'runtime_receipt', producerRevision));
  for (const resource of payload.resources) {
    facts.push(fact(input, resource.resource_type, resource.resource_id, resource.role, producerRevision));
  }
  return dedupeFacts(facts);
}

export function createCanonicalEvidenceEntityExtractor(options: { producer_revision: string }): EvidenceEntityExtractorV1 {
  return {
    async extract(input) {
      switch (input.evidence_kind) {
        case 'schema': return extractSchemaEvidenceEntities(input, options.producer_revision);
        case 'test': return extractTestEvidenceEntities(input, options.producer_revision);
        case 'openspec': return extractOpenSpecEvidenceEntities(input, options.producer_revision);
        case 'runtime': return extractRuntimeEvidenceEntities(input, options.producer_revision);
        default: throw new Error(`EVIDENCE_ENTITY_EXTRACTOR_UNSUPPORTED_KIND:${input.evidence_kind}`);
      }
    },
  };
}

export function describeEvidenceEntityExtractors(): string {
  return [
    'Schema, test, OpenSpec and runtime extractors consume already-canonical registry IDs; they do not synthesize identities from labels or prose.',
    'Test runtime results remain revisioned receipt evidence separate from static assertion structure.',
    'LangExtract may nominate grounded relations but cannot establish these non-code canonical IDs.',
    'The extracted facts are shared SQL join keys for dynamic hyperedge discovery, not proof that a canonical N-ary relationship exists.',
  ].join(' ');
}
