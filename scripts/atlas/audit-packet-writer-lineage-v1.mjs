#!/usr/bin/env node
/**
 * PACKET-WRITER-LINEAGE-01 (read-only)
 *
 * Classifies active atlas_packets writers by the lineage evidence they accept
 * and persist. This is a source/contract census; it never imports a writer or
 * invokes a datastore mutation. Live column truth is intentionally reported
 * separately by audit-packet-write-revision-contract-v1.mjs.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'packet-writer-lineage-v1.json');

const WRITERS = [
  {
    path: 'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts',
    owner: 'CANONICAL_SEMANTIC_WRITER',
    entrypoints: ['persistCanonicalSemanticPacketEmbedding'],
  },
  {
    path: 'sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts',
    owner: 'ACP_MATERIALIZER',
    entrypoints: ['INSERT INTO atlas_packets'],
  },
  {
    path: 'scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs',
    owner: 'LEGACY_NDJSON_SYNC',
    entrypoints: ['INSERT INTO atlas_packets'],
  },
  {
    path: 'scripts/atlas/index-parent-atlas-packets.mjs',
    owner: 'LEGACY_INDEXER',
    entrypoints: ['INSERT INTO atlas_packets'],
  },
  {
    path: 'scripts/atlas/upsert-whole-codebase-atlas-packets.mjs',
    owner: 'LEGACY_WHOLE_CODEBASE_UPSERT',
    entrypoints: ['INSERT INTO atlas_packets'],
  },
];

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function classify(source) {
  const lower = source.toLowerCase();
  const hasContentHash = /content[_-]?hash|contenthash/.test(lower);
  const hasSourceRevision = /source[_-]?revision|sourcerevision/.test(lower);
  const hasWorkspaceRevision = /workspace[_-]?revision|workspacerevision/.test(lower);
  const hasLegacySha = /\bsha256\b|sha256\(/.test(lower);
  const hasApply = /--apply|apply\b|write\b|insert into atlas_packets/.test(lower);

  if (hasContentHash && hasSourceRevision && hasWorkspaceRevision) {
    return 'REVISION_BOUND_CONTRACT_PRESENT';
  }
  if (hasContentHash && hasWorkspaceRevision) {
    return 'CONTENT_AND_WORKSPACE_EVIDENCE_PARTIAL';
  }
  if (hasLegacySha && !hasContentHash && !hasSourceRevision) {
    return 'LEGACY_SHA256_ONLY';
  }
  if (hasApply || /insert into atlas_packets/.test(lower)) {
    return 'UNQUALIFIED_OR_SCHEMA_DRIFT_BLOCKED';
  }
  return 'NON_WRITER_OR_UNRESOLVED';
}

function extractFields(source) {
  const fields = [];
  for (const field of ['packet_key', 'source_ref', 'content_hash', 'sha256', 'source_revision', 'workspace_revision', 'lineage_version']) {
    if (new RegExp(`\\b${field}\\b`, 'i').test(source)) fields.push(field);
  }
  return fields;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

const rows = WRITERS.map((writer) => {
  const absolutePath = path.join(ROOT, writer.path);
  const exists = fs.existsSync(absolutePath);
  const source = exists ? fs.readFileSync(absolutePath, 'utf8') : '';
  const classification = exists ? classify(source) : 'MISSING_SOURCE';
  return {
    path: writer.path,
    owner: writer.owner,
    exists,
    entrypoints: writer.entrypoints,
    sourceChecksum: exists ? sha256(source) : null,
    referencedLineageFields: exists ? extractFields(source) : [],
    classification,
    promotionEligible: classification === 'REVISION_BOUND_CONTRACT_PRESENT',
    writesPerformed: false,
    reason: classification === 'REVISION_BOUND_CONTRACT_PRESENT'
      ? 'Source contains all required revision/content field names; live schema and caller input still require independent proof.'
      : classification === 'CONTENT_AND_WORKSPACE_EVIDENCE_PARTIAL'
        ? 'Writer carries content/workspace evidence but does not establish a complete source-revision-qualified contract.'
        : classification === 'LEGACY_SHA256_ONLY'
          ? 'sha256 is a legacy packet/artifact namespace and is not canonical whole-source content identity.'
          : 'Writer does not prove current workspace/source/content identity at its mutation boundary.',
  };
});

const report = {
  schema: 'atlas.packet-writer-lineage.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SOURCE_CENSUS',
  gate: 'PACKET-WRITER-LINEAGE-01',
  writesPerformed: false,
  canonicalDigestNamespace: 'atlas_packets.content_hash',
  legacyDigestNamespaces: ['atlas_packets.sha256'],
  liveSchemaDependency: {
    sourceRevisionColumn: 'UNPROVEN_LIVE_ABSENT_PER_PACKET_WRITE_REVISION_CONTRACT_AUDIT',
    workspaceRevision: 'PRESENT_BUT_HISTORICAL_DEFAULT_SHAPED',
    contentHash: 'PRESENT_BUT_SPARSE',
  },
  writers: rows,
  summary: {
    totalWriters: rows.length,
    revisionBoundContractPresent: rows.filter((row) => row.classification === 'REVISION_BOUND_CONTRACT_PRESENT').length,
    partialEvidence: rows.filter((row) => row.classification === 'CONTENT_AND_WORKSPACE_EVIDENCE_PARTIAL').length,
    legacySha256Only: rows.filter((row) => row.classification === 'LEGACY_SHA256_ONLY').length,
    unqualifiedOrSchemaDriftBlocked: rows.filter((row) => row.classification === 'UNQUALIFIED_OR_SCHEMA_DRIFT_BLOCKED').length,
  },
  verdict: 'PACKET_WRITER_CURRENT_LINEAGE_NOT_PROVEN',
  nextGate: 'PACKET-DIGEST-BRIDGE-ADMISSION-01',
  requiredBeforeApply: [
    'one canonical writer accepts admitted workspaceRevision and independently proven source content digest',
    'live atlas_packets schema exposes the fields used by that writer, or an explicitly approved equivalent contract exists',
    'legacy writers are quarantined from current-corpus apply paths',
    'bounded write/readback proves packet digest and workspace/source lineage against the selected execution',
  ],
};

atomicWrite(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  status: report.verdict,
  totalWriters: report.summary.totalWriters,
  revisionBoundContractPresent: report.summary.revisionBoundContractPresent,
  legacySha256Only: report.summary.legacySha256Only,
  unqualifiedOrSchemaDriftBlocked: report.summary.unqualifiedOrSchemaDriftBlocked,
  writesPerformed: false,
  reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
}, null, 2));
