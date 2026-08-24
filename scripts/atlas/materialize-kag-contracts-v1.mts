import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { HyperedgeV1Schema, type HyperedgeV1 } from '../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts';
import { OntologyLinkedTupleV1Schema, type OntologyLinkedTupleV1 } from '../../sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts';
import {
  toAtlasHyperedgePersistenceRowsV1,
  toAtlasOntologyTuplePersistenceRowV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/integration/kag-persistence-row-v1.ts';
import { loadRepoEnv, REPO_ROOT, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;

type InputRecord =
  | { kind: 'hyperedge'; value: unknown }
  | { kind: 'ontology_tuple'; value: unknown };

type ParsedRecord =
  | { kind: 'hyperedge'; value: HyperedgeV1 }
  | { kind: 'ontology_tuple'; value: OntologyLinkedTupleV1 };

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const inputPath = arg('input') ?? process.env.ATLAS_KAG_INPUT ?? process.env.npm_config_input ?? null;
const limit = Math.max(1, Number(arg('limit') ?? process.env.ATLAS_KAG_LIMIT ?? process.env.npm_config_limit ?? 1000));
const apply = process.argv.includes('--apply') || process.env.ATLAS_KAG_APPLY === '1' || process.env.npm_config_apply === 'true';
const reportPath = arg('report') ?? process.env.ATLAS_KAG_REPORT ?? process.env.npm_config_report ?? path.join(REPO_ROOT, 'docs/reports/atlas-kag-materialization-v1.json');

if (!inputPath) {
  throw new Error('KAG_INPUT_REQUIRED: pass --input=<contracts.jsonl>');
}

const lines = (await readFile(path.resolve(inputPath), 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, limit);

const parsed: ParsedRecord[] = [];
const rejected: Array<{ line: number; error: string }> = [];

for (const [index, line] of lines.entries()) {
  try {
    const record = JSON.parse(line) as InputRecord;
    if (record.kind === 'hyperedge') {
      parsed.push({ kind: 'hyperedge', value: HyperedgeV1Schema.parse(record.value) });
    } else if (record.kind === 'ontology_tuple') {
      parsed.push({ kind: 'ontology_tuple', value: OntologyLinkedTupleV1Schema.parse(record.value) });
    } else {
      throw new Error('unsupported kind');
    }
  } catch (error) {
    rejected.push({ line: index + 1, error: error instanceof Error ? error.message : String(error) });
  }
}

const hyperedges = parsed.filter((record): record is Extract<ParsedRecord, { kind: 'hyperedge' }> => record.kind === 'hyperedge');
const tuples = parsed.filter((record): record is Extract<ParsedRecord, { kind: 'ontology_tuple' }> => record.kind === 'ontology_tuple');
const hyperedgeRows = hyperedges.map((record) => toAtlasHyperedgePersistenceRowsV1(record.value));
const tupleRows = tuples.map((record) => toAtlasOntologyTuplePersistenceRowV1(record.value));

const report: Record<string, unknown> = {
  schema: 'atlas.kag.materialization.v1',
  status: rejected.length > 0 ? 'REJECTED_INPUT' : apply ? 'APPLIED' : 'DRY_RUN_READY',
  inputPath: path.resolve(inputPath),
  limit,
  inputLines: lines.length,
  accepted: parsed.length,
  rejected,
  hyperedges: hyperedgeRows.length,
  hyperedgeMembers: hyperedgeRows.reduce((count, row) => count + row.members.length, 0),
  ontologyTuples: tupleRows.length,
  canonicalWrites: apply && rejected.length === 0,
  identityMinting: false,
};

if (apply && rejected.length === 0) {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { hyperedge: row, members } of hyperedgeRows) {
      const result = await client.query<{ hyperedge_id: string }>(
        `INSERT INTO atlas_hyperedges
          (contract_hyperedge_id, relation_type, schema_id, schema_version,
           source_ref_key, packet_key, workspace_revision, source_revision,
           graph_revision, producer_revision, evidence_hash, evidence_refs,
           checksum, properties, lifecycle, provenance, extractor_version, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13, $14::jsonb, $15, $16::jsonb, $17, $18)
         ON CONFLICT (contract_hyperedge_id) WHERE contract_hyperedge_id IS NOT NULL
         DO UPDATE SET relation_type = EXCLUDED.relation_type,
           packet_key = EXCLUDED.packet_key,
           workspace_revision = EXCLUDED.workspace_revision,
           source_revision = EXCLUDED.source_revision,
           graph_revision = EXCLUDED.graph_revision,
           producer_revision = EXCLUDED.producer_revision,
           evidence_hash = EXCLUDED.evidence_hash,
           evidence_refs = EXCLUDED.evidence_refs,
           checksum = EXCLUDED.checksum,
           properties = EXCLUDED.properties,
           lifecycle = EXCLUDED.lifecycle,
           provenance = EXCLUDED.provenance,
           extractor_version = EXCLUDED.extractor_version,
           confidence = EXCLUDED.confidence
         RETURNING hyperedge_id`,
        [row.contractHyperedgeId, row.relationType, row.schemaId, row.schemaVersion,
          row.sourceRefKey, row.packetKey, row.workspaceRevision, row.sourceRevision,
          row.graphRevision, row.producerRevision, row.evidenceHash, row.evidenceRefs,
          row.checksum, JSON.stringify(row.properties), row.lifecycle,
          JSON.stringify(row.provenance), row.extractorVersion, row.confidence],
      );
      const hyperedgeId = result.rows[0]?.hyperedge_id;
      if (!hyperedgeId) throw new Error(`KAG_HYPEREDGE_UPSERT_MISSING_ID:${row.contractHyperedgeId}`);
      for (const member of members) {
        await client.query(
          `INSERT INTO atlas_hyperedge_members
            (hyperedge_id, member_id, member_type, member_role, ordinal)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (hyperedge_id, member_id, member_role)
           DO UPDATE SET member_type = EXCLUDED.member_type, ordinal = EXCLUDED.ordinal`,
          [hyperedgeId, member.memberId, member.memberType, member.memberRole, member.ordinal],
        );
      }
    }
    for (const tuple of tupleRows) {
      await client.query(
        `INSERT INTO atlas_ontology_linked_tuples
          (tuple_id, schema_version, packet_key, source_ref, tree_node_id,
           document_id, title_id, surface_text, token_index, part_of_speech,
           label, label_kind, label_source, ontology_ids, concept_ids,
           participants, evidence_refs, relation_revision, evidence_span,
           confidence, evidence_state, lifecycle, provenance, producer_revision,
           updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13, $14::text[], $15::text[], $16::jsonb, $17::text[],
                 $18, $19::jsonb, $20, $21, $22, $23::jsonb, $24, now())
         ON CONFLICT (tuple_id)
         DO UPDATE SET schema_version = EXCLUDED.schema_version,
           packet_key = EXCLUDED.packet_key, source_ref = EXCLUDED.source_ref,
           tree_node_id = EXCLUDED.tree_node_id, document_id = EXCLUDED.document_id,
           title_id = EXCLUDED.title_id, surface_text = EXCLUDED.surface_text,
           token_index = EXCLUDED.token_index, part_of_speech = EXCLUDED.part_of_speech,
           label = EXCLUDED.label, label_kind = EXCLUDED.label_kind,
           label_source = EXCLUDED.label_source,
           ontology_ids = EXCLUDED.ontology_ids, concept_ids = EXCLUDED.concept_ids,
           participants = EXCLUDED.participants, evidence_refs = EXCLUDED.evidence_refs,
           relation_revision = EXCLUDED.relation_revision,
           evidence_span = EXCLUDED.evidence_span, confidence = EXCLUDED.confidence,
           evidence_state = EXCLUDED.evidence_state, lifecycle = EXCLUDED.lifecycle,
           provenance = EXCLUDED.provenance, producer_revision = EXCLUDED.producer_revision,
           updated_at = now()`,
        [tuple.tupleId, tuple.schemaVersion, tuple.packetKey ?? null, tuple.sourceRef,
          tuple.treeNodeId ?? null, tuple.documentId ?? null, tuple.titleId ?? null,
          tuple.surfaceText, tuple.tokenIndex ?? null, tuple.partOfSpeech ?? null,
          tuple.label, tuple.labelKind, tuple.labelSource, tuple.ontologyIds,
          tuple.conceptIds, JSON.stringify(tuple.participants ?? []), tuple.evidenceRefs ?? [],
          tuple.relationRevision ?? null, tuple.evidenceSpan ? JSON.stringify(tuple.evidenceSpan) : null,
          tuple.confidence, tuple.evidenceState, tuple.lifecycle,
          JSON.stringify(tuple.provenance), tuple.provenance.producerRevision ?? null],
      );
    }
    await client.query('COMMIT');
    report.materialized = { hyperedges: hyperedgeRows.length, members: report.hyperedgeMembers, ontologyTuples: tupleRows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    report.status = 'FAILED_ROLLED_BACK';
    report.canonicalWrites = false;
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
