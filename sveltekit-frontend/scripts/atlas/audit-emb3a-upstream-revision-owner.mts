#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '$lib/server/db/client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const JSON_REPORT = path.join(REPORT_DIR, 'emb3a-upstream-revision-owner-audit.json');
const MD_REPORT = path.join(REPORT_DIR, 'emb3a-upstream-revision-owner-audit.md');
const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
const QDRANT_COLLECTION = process.env.ATLAS_EMB3A_QDRANT_COLLECTION || 'codebase_chunks_768';
const SAMPLE_LIMIT = Math.max(1, Math.min(500, Number(process.env.ATLAS_EMB3A_AUDIT_LIMIT || 100)));

const TARGET_FIELDS = [
  'canonical_id',
  'packet_key',
  'source_ref',
  'tree_node_id',
  'symbol_version_id',
  'workspace_revision',
  'source_revision',
  'representation_id',
  'representation_revision',
  'embedding_model_revision',
] as const;

type TargetField = typeof TARGET_FIELDS[number];

type ColumnFact = { column_name: string; is_nullable: string; data_type: string; column_default: string | null };
type CountRow = { total: string | number; populated: string | number };

async function columns(tableName: string): Promise<ColumnFact[]> {
  const result = await pool.query<ColumnFact>(`
    SELECT column_name, is_nullable, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows;
}

function hasColumn(rows: readonly ColumnFact[], name: string): boolean {
  return rows.some((row) => row.column_name === name);
}

async function population(tableName: string, columnName: string): Promise<{ total: number; populated: number } | null> {
  const allowed = new Set(['workspace_revision', 'source_revision', 'representation_revision', 'source_representation_id', 'encoder_revision']);
  if (!allowed.has(columnName)) throw new Error(`UNSAFE_AUDIT_COLUMN:${columnName}`);
  if (!['atlas_packets', 'atlas_ast_nodes'].includes(tableName)) throw new Error(`UNSAFE_AUDIT_TABLE:${tableName}`);
  const result = await pool.query<CountRow>(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE ${columnName} IS NOT NULL${columnName === 'workspace_revision' || columnName === 'representation_revision' ? ` AND ${columnName} <> 0` : ''}) AS populated
    FROM ${tableName}
  `);
  const row = result.rows[0];
  return row ? { total: Number(row.total), populated: Number(row.populated) } : null;
}

async function qdrantJson(relativeUrl: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${QDRANT_URL}${relativeUrl}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`QDRANT_HTTP_${response.status}:${relativeUrl}`);
  return response.json();
}

function coverage(points: any[], field: TargetField): { present: number; nonNull: number; total: number; coverage: number } {
  let present = 0;
  let nonNull = 0;
  for (const point of points) {
    const payload = point?.payload && typeof point.payload === 'object' ? point.payload : {};
    if (Object.prototype.hasOwnProperty.call(payload, field)) present += 1;
    if (payload[field] !== null && payload[field] !== undefined && payload[field] !== '') nonNull += 1;
  }
  return {
    present,
    nonNull,
    total: points.length,
    coverage: points.length === 0 ? 0 : nonNull / points.length,
  };
}

let qdrantCollectionInfo: any = null;
let qdrantPoints: any[] = [];
let qdrantError: string | null = null;
try {
  qdrantCollectionInfo = await qdrantJson(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}`);
  const scroll = await qdrantJson(`/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({ limit: SAMPLE_LIMIT, with_payload: true, with_vector: false }),
  });
  qdrantPoints = scroll?.result?.points ?? [];
} catch (error) {
  qdrantError = error instanceof Error ? error.message : String(error);
}

const packetColumns = await columns('atlas_packets');
const astNodeColumns = await columns('atlas_ast_nodes');
const packetWorkspacePopulation = hasColumn(packetColumns, 'workspace_revision')
  ? await population('atlas_packets', 'workspace_revision')
  : null;
const packetRepresentationPopulation = hasColumn(packetColumns, 'representation_revision')
  ? await population('atlas_packets', 'representation_revision')
  : null;
const packetRepresentationIdPopulation = hasColumn(packetColumns, 'source_representation_id')
  ? await population('atlas_packets', 'source_representation_id')
  : null;
const packetEncoderPopulation = hasColumn(packetColumns, 'encoder_revision')
  ? await population('atlas_packets', 'encoder_revision')
  : null;
const astSourceRevisionPopulation = hasColumn(astNodeColumns, 'source_revision')
  ? await population('atlas_ast_nodes', 'source_revision')
  : null;

const semanticWriterPath = path.resolve(REPO_ROOT, 'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts');
const qdrantPayloadBuilderPath = path.resolve(REPO_ROOT, 'sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts');
const qdrantWorkerPath = path.resolve(REPO_ROOT, 'sveltekit-frontend/src/lib/server/workers/qdrant-sync-worker.ts');
const [semanticWriter, qdrantPayloadBuilder, qdrantWorker] = await Promise.all([
  readFile(semanticWriterPath, 'utf8'),
  readFile(qdrantPayloadBuilderPath, 'utf8'),
  readFile(qdrantWorkerPath, 'utf8'),
]);

const sourceAudit = {
  semanticPacketWriter: {
    writesWorkspaceRevision: /workspaceRevision\s*:/.test(semanticWriter),
    writesSourceRevision: /sourceRevision\s*:/.test(semanticWriter),
    writesRepresentationRevision: /representationRevision\s*:/.test(semanticWriter),
    writesEncoderRevision: /encoderRevision\s*:/.test(semanticWriter),
  },
  qdrantPayloadBuilder: {
    emitsWorkspaceRevision: /workspace_revision\s*:/.test(qdrantPayloadBuilder),
    emitsSourceRevision: /source_revision\s*:/.test(qdrantPayloadBuilder),
    emitsRepresentationId: /representation_id\s*:/.test(qdrantPayloadBuilder),
    emitsRepresentationRevision: /representation_revision\s*:/.test(qdrantPayloadBuilder),
    defaultsWorkspaceRevisionToZero: /workspaceRevision\s*\|\|\s*0/.test(qdrantPayloadBuilder),
    defaultsRepresentationRevisionToZero: /representationRevision\s*\|\|\s*0/.test(qdrantPayloadBuilder),
  },
  qdrantSyncWorker: {
    readsAtlasPackets: /from\(atlasPackets\)/.test(qdrantWorker),
    usesPayloadBuilder: /buildQdrantSyncPayload/.test(qdrantWorker),
    collectionLiteral768: /codebase_chunks_768/.test(qdrantWorker),
  },
};

const payloadSchema = qdrantCollectionInfo?.result?.payload_schema ?? {};
const qdrantFields = Object.fromEntries(TARGET_FIELDS.map((field) => [field, {
  ...coverage(qdrantPoints, field),
  payloadIndexPresent: Object.prototype.hasOwnProperty.call(payloadSchema, field),
}]));

const revisionOwnerProven = Boolean(
  packetWorkspacePopulation
  && packetWorkspacePopulation.total > 0
  && packetWorkspacePopulation.populated === packetWorkspacePopulation.total
  && astSourceRevisionPopulation
  && astSourceRevisionPopulation.total > 0
  && astSourceRevisionPopulation.populated === astSourceRevisionPopulation.total
  && sourceAudit.semanticPacketWriter.writesWorkspaceRevision
  && sourceAudit.semanticPacketWriter.writesSourceRevision,
);

const likelyCause = revisionOwnerProven
  ? 'REVISION_OWNER_POPULATION_PROVEN_FOR_SAMPLED_BOUNDARIES'
  : 'REVISION_OWNER_NOT_PROVEN';

const report = {
  schema: 'atlas.emb3a-upstream-revision-owner-audit.v1',
  status: likelyCause,
  generatedAt: new Date().toISOString(),
  readOnly: true,
  qdrantCollection: QDRANT_COLLECTION,
  qdrantSampleLimit: SAMPLE_LIMIT,
  qdrantSampledPoints: qdrantPoints.length,
  qdrantError,
  postgres: {
    atlasPackets: {
      sourceRevisionColumnPresent: hasColumn(packetColumns, 'source_revision'),
      workspaceRevisionColumnPresent: hasColumn(packetColumns, 'workspace_revision'),
      workspaceRevisionPopulation: packetWorkspacePopulation,
      representationRevisionPopulation: packetRepresentationPopulation,
      sourceRepresentationIdPopulation: packetRepresentationIdPopulation,
      encoderRevisionPopulation: packetEncoderPopulation,
    },
    atlasAstNodes: {
      sourceRevisionColumnPresent: hasColumn(astNodeColumns, 'source_revision'),
      sourceRevisionPopulation: astSourceRevisionPopulation,
    },
  },
  sourceAudit,
  qdrantFields,
  conclusion: {
    revisionOwnerProven,
    likelyCause,
    mustNotInferFrom: ['vector_dimension', 'timestamp', 'qdrant_point_id', 'representation_revision'],
    safeNextBoundary: 'Populate authoritative revisions upstream before changing Qdrant projection semantics.',
  },
};

await mkdir(REPORT_DIR, { recursive: true });
await writeFile(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const md = `# EMB3A Upstream Revision Owner Audit\n\nStatus: **${likelyCause}**\n\nThis command is read-only with respect to PostgreSQL and Qdrant. It performs SELECTs, collection metadata reads, and a payload scroll only.\n\n## PostgreSQL\n\n- atlas_packets.source_revision column: **${report.postgres.atlasPackets.sourceRevisionColumnPresent}**\n- atlas_packets.workspace_revision populated non-zero: **${packetWorkspacePopulation?.populated ?? 0}/${packetWorkspacePopulation?.total ?? 0}**\n- atlas_ast_nodes.source_revision populated: **${astSourceRevisionPopulation?.populated ?? 0}/${astSourceRevisionPopulation?.total ?? 0}**\n\n## Writer boundaries\n\n- semantic packet writer writes workspace revision: **${sourceAudit.semanticPacketWriter.writesWorkspaceRevision}**\n- semantic packet writer writes source revision: **${sourceAudit.semanticPacketWriter.writesSourceRevision}**\n- Qdrant payload builder emits workspace/source revision keys: **${sourceAudit.qdrantPayloadBuilder.emitsWorkspaceRevision}/${sourceAudit.qdrantPayloadBuilder.emitsSourceRevision}**\n- Qdrant payload builder defaults workspace revision to zero: **${sourceAudit.qdrantPayloadBuilder.defaultsWorkspaceRevisionToZero}**\n\n## Qdrant\n\nCollection: \`${QDRANT_COLLECTION}\`  \nSampled points: **${qdrantPoints.length}**  \nRead error: **${qdrantError ?? 'none'}**\n\n| Field | Non-null / sample | Payload index present |\n| --- | ---: | --- |\n${TARGET_FIELDS.map((field) => `| \`${field}\` | ${qdrantFields[field].nonNull}/${qdrantFields[field].total} | ${qdrantFields[field].payloadIndexPresent} |`).join('\n')}\n\n## Conclusion\n\n**${likelyCause}**\n\nDo not synthesize workspace/source revision in the Qdrant worker. Prove and populate the authoritative upstream revision owner first, then propagate and read back before index reconciliation.\n`;
await writeFile(MD_REPORT, md, 'utf8');

console.log(JSON.stringify({
  status: likelyCause,
  readOnly: true,
  jsonReport: path.relative(REPO_ROOT, JSON_REPORT).replaceAll('\\', '/'),
  markdownReport: path.relative(REPO_ROOT, MD_REPORT).replaceAll('\\', '/'),
  qdrantSampledPoints: qdrantPoints.length,
  qdrantError,
}, null, 2));

await pool.end();
