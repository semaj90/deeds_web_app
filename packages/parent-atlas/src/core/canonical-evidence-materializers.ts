import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  extractOpenSpecEvidenceEntities,
  extractSchemaEvidenceEntities,
  extractTestEvidenceEntities,
  schemaEvidencePayloadSchema,
} from './evidence-entity-extractors.js';
import { createEvidenceEntityRepository } from './evidence-entity-repository.js';
import { createEvidenceLedgerRepository } from './evidence-ledger-repository.js';
import type { OpenSpecCompiledDocumentV1 } from './openspec-repository-ingestion.js';
import type { SchemaObjectNominationV1, SchemaObjectResolutionV1 } from './schema-object-registry.js';
import type { TestCaseNominationV1, TestCaseResolutionV1 } from './test-case-registry.js';
import { createTestExecutionRepository } from './test-execution-repository.js';
import { promoteVitestExecutionToTestEvidence, type TestExecutionObservationV1 } from './vitest-test-evidence-compiler.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function evidenceId(kind: string, sourceRef: string, sourceRevision: string, evidenceRevision: string): string {
  return `evidence:${kind}:${sha256([sourceRef, sourceRevision, evidenceRevision]).slice(0, 40)}`;
}

export async function materializeOpenSpecDocument(pool: Pool, input: {
  document: OpenSpecCompiledDocumentV1;
  producer_revision: string;
}): Promise<{ evidence_id: string; fact_count: number }> {
  const ledger = createEvidenceLedgerRepository(pool);
  const entities = createEvidenceEntityRepository(pool);
  const document = input.document;
  const evidenceRevision = `openspec:${document.receipt.output_checksum}`;
  const id = evidenceId('openspec', document.source_ref, document.source_revision, evidenceRevision);

  await ledger.upsert({
    schema: 'atlas.evidence-record.v1',
    evidence_id: id,
    evidence_kind: 'openspec',
    source_ref: document.source_ref,
    source_revision: document.source_revision,
    evidence_revision: evidenceRevision,
    producer_revision: input.producer_revision,
    confidence: 1,
    payload: document.payload,
    tags: ['openspec', document.receipt.document_kind],
    search_text: document.receipt.locations.map((item) => item.title).join(' '),
  });
  await ledger.readback({ evidence_id: id, producer_revision: input.producer_revision });

  const facts = extractOpenSpecEvidenceEntities({
    evidence_id: id,
    evidence_kind: 'openspec',
    source_ref: document.source_ref,
    source_revision: document.source_revision,
    evidence_revision: evidenceRevision,
    workspace_revision: document.workspace_revision,
    payload: document.payload,
  }, input.producer_revision);
  const receipt = await entities.upsertFacts({
    source_snapshot_revision: document.workspace_revision,
    facts,
    source_checksum: document.receipt.input_checksum,
    producer_revision: input.producer_revision,
  });
  if (receipt.rejected_count > 0) throw new Error(`OPENSPEC_ENTITY_MATERIALIZATION_REJECTED:${receipt.rejected_refs.join(',')}`);
  return { evidence_id: id, fact_count: receipt.inserted_count };
}

function resolutionMap(resolutions: SchemaObjectResolutionV1[]): Map<string, SchemaObjectResolutionV1> {
  return new Map(resolutions.map((item) => [item.nomination_id, item]));
}

/** Build the existing canonical schema-evidence shape from registry-resolved nominations. */
export function compileResolvedSchemaEvidence(input: {
  schema_revision: string;
  nominations: SchemaObjectNominationV1[];
  resolutions: SchemaObjectResolutionV1[];
}) {
  const byNomination = resolutionMap(input.resolutions);
  const canonicalByObjectKey = new Map<string, string>();
  for (const nomination of input.nominations) {
    const resolution = byNomination.get(nomination.nomination_id);
    if (resolution?.status === 'canonical' && resolution.stable_schema_object_id) {
      canonicalByObjectKey.set(nomination.object_key, resolution.stable_schema_object_id);
    }
  }

  const tables = input.nominations
    .filter((nomination) => nomination.kind === 'table')
    .flatMap((table) => {
      const tableResolution = byNomination.get(table.nomination_id);
      if (tableResolution?.status !== 'canonical' || !tableResolution.stable_schema_object_id) return [];
      const children = input.nominations.filter((item) => item.parent_object_key === table.object_key);
      const childId = (kind: SchemaObjectNominationV1['kind']) => children
        .filter((item) => item.kind === kind)
        .flatMap((item) => {
          const resolution = byNomination.get(item.nomination_id);
          return resolution?.status === 'canonical' && resolution.stable_schema_object_id
            ? [resolution.stable_schema_object_id]
            : [];
        });
      return [{
        table_id: tableResolution.stable_schema_object_id,
        identity_status: 'canonical' as const,
        columns: childId('column').map((column_id) => ({ column_id, identity_status: 'canonical' as const })),
        foreign_keys: childId('foreign_key').map((foreign_key_id) => ({ foreign_key_id, identity_status: 'canonical' as const })),
        indexes: childId('index').map((index_id) => ({ index_id, identity_status: 'canonical' as const })),
        policies: childId('database_policy').map((policy_id) => ({ policy_id, identity_status: 'canonical' as const })),
      }];
    });

  return schemaEvidencePayloadSchema.parse({
    schema: 'atlas.schema-evidence.v1',
    schema_revision: input.schema_revision,
    tables,
  });
}

export async function materializeResolvedSchemaEvidence(pool: Pool, input: {
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  schema_revision: string;
  nominations: SchemaObjectNominationV1[];
  resolutions: SchemaObjectResolutionV1[];
  producer_revision: string;
}): Promise<{ evidence_id: string; fact_count: number; unresolved_count: number }> {
  const ledger = createEvidenceLedgerRepository(pool);
  const entities = createEvidenceEntityRepository(pool);
  const payload = compileResolvedSchemaEvidence(input);
  const evidenceRevision = `schema:${sha256({ schema_revision: input.schema_revision, nominations: input.nominations, resolutions: input.resolutions })}`;
  const id = evidenceId('schema', input.source_ref, input.source_revision, evidenceRevision);
  const unresolvedCount = input.resolutions.filter((item) => item.status !== 'canonical').length;

  await ledger.upsert({
    schema: 'atlas.evidence-record.v1',
    evidence_id: id,
    evidence_kind: 'schema',
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    evidence_revision: evidenceRevision,
    producer_revision: input.producer_revision,
    confidence: unresolvedCount === 0 ? 1 : 0.8,
    payload: {
      canonical_schema: payload,
      nominations: input.nominations,
      resolutions: input.resolutions,
      unresolved_count: unresolvedCount,
    },
    tags: ['schema', 'postgres', 'registry-resolved'],
    search_text: input.nominations.map((item) => item.qualified_name).join(' '),
  });
  await ledger.readback({ evidence_id: id, producer_revision: input.producer_revision });

  const facts = extractSchemaEvidenceEntities({
    evidence_id: id,
    evidence_kind: 'schema',
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    evidence_revision: evidenceRevision,
    workspace_revision: input.workspace_revision,
    payload,
  }, input.producer_revision);
  const receipt = await entities.upsertFacts({
    source_snapshot_revision: input.workspace_revision,
    facts,
    source_checksum: sha256(input.nominations),
    producer_revision: input.producer_revision,
  });
  if (receipt.rejected_count > 0) throw new Error(`SCHEMA_ENTITY_MATERIALIZATION_REJECTED:${receipt.rejected_refs.join(',')}`);
  return { evidence_id: id, fact_count: receipt.inserted_count, unresolved_count: unresolvedCount };
}

export async function materializeCanonicalTestExecution(pool: Pool, input: {
  nomination: TestCaseNominationV1;
  resolution: TestCaseResolutionV1;
  execution: TestExecutionObservationV1;
  workspace_revision: string;
  producer_revision: string;
}): Promise<{ evidence_id: string; fact_count: number; execution_receipt_id: string }> {
  const executions = createTestExecutionRepository(pool);
  const ledger = createEvidenceLedgerRepository(pool);
  const entities = createEvidenceEntityRepository(pool);

  await executions.persist({
    observation: input.execution,
    resolution: input.resolution,
    producer_revision: input.producer_revision,
  });
  const payload = promoteVitestExecutionToTestEvidence({
    nomination: input.nomination,
    resolution: input.resolution,
    execution: input.execution,
  });
  const evidenceRevision = `test:${sha256(payload)}`;
  const id = evidenceId('test', input.nomination.source_ref, input.nomination.source_revision, evidenceRevision);

  await ledger.upsert({
    schema: 'atlas.evidence-record.v1',
    evidence_id: id,
    evidence_kind: 'test',
    source_ref: input.nomination.source_ref,
    source_revision: input.nomination.source_revision,
    evidence_revision: evidenceRevision,
    producer_revision: input.producer_revision,
    confidence: 1,
    payload,
    tags: ['test', 'vitest', `status:${input.execution.status}`],
    search_text: `${input.nomination.full_name} ${input.execution.failure_messages.join(' ')}`,
  });
  await ledger.readback({ evidence_id: id, producer_revision: input.producer_revision });
  const facts = extractTestEvidenceEntities({
    evidence_id: id,
    evidence_kind: 'test',
    source_ref: input.nomination.source_ref,
    source_revision: input.nomination.source_revision,
    evidence_revision: evidenceRevision,
    workspace_revision: input.workspace_revision,
    payload,
  }, input.producer_revision);
  const receipt = await entities.upsertFacts({
    source_snapshot_revision: input.workspace_revision,
    facts,
    source_checksum: input.execution.report_checksum,
    producer_revision: input.producer_revision,
  });
  if (receipt.rejected_count > 0) throw new Error(`TEST_ENTITY_MATERIALIZATION_REJECTED:${receipt.rejected_refs.join(',')}`);
  return { evidence_id: id, fact_count: receipt.inserted_count, execution_receipt_id: input.execution.execution_receipt_id };
}

export function describeCanonicalEvidenceMaterializers(): string {
  return [
    'All evidence families write atlas_evidence before atlas_evidence_entities so FK/readback order is deterministic.',
    'OpenSpec IDs are already parser-canonical; schema/test IDs require canonical registry resolution before shared entity facts.',
    'Unresolved nominations may remain in evidence payloads but never become dynamic-hyperedge join keys.',
    'Materialization creates evidence/entity facts only; dynamic hyperedge promotion to canonical relationships remains a separate review step.',
  ].join(' ');
}
