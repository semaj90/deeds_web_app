#!/usr/bin/env node
/**
 * Read-only admission planner for the NB/LR domain-classifier corpus.
 *
 * A classifier label is evidence only. This planner proves whether each label
 * row can resolve through the selected Graphify execution and the canonical
 * packet digest bridge. It never retrains, writes tuples, or changes packets.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const labelsFile = path.resolve(REPO_ROOT, value('--labels-file') ?? 'docs/reports/domain-classifier-weak-label-bundle-v1.json');
const workspaceRevision = value('--workspace-revision');
const executionId = value('--execution-id');
const limit = Number(value('--limit') ?? 1000);
if (!workspaceRevision || !/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision)) throw new Error('EXPLICIT_VALID_WORKSPACE_REVISION_REQUIRED');
if (!executionId) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('BOUNDED_LIMIT_REQUIRED');

const reportPath = path.join(REPO_ROOT, 'docs/reports/domain-classifier-cohort-admission-v1.json');
const sha256 = (valueToHash) => crypto.createHash('sha256').update(valueToHash).digest('hex');
const stableJson = (valueToSerialize) => JSON.stringify(valueToSerialize, Object.keys(valueToSerialize).sort());
const sourceAliases = (sourceRef) => {
  const normalized = sourceRef.replaceAll('\\', '/').replace(/^\.\//, '');
  const aliases = new Set([normalized]);
  if (normalized.startsWith('sveltekit-frontend/')) aliases.add(normalized.slice('sveltekit-frontend/'.length));
  else aliases.add(`sveltekit-frontend/${normalized}`);
  return [...aliases];
};

const bundle = JSON.parse(fs.readFileSync(labelsFile, 'utf8'));
if (bundle.schema !== 'atlas.domain-classifier-training-labels.v1' || !Array.isArray(bundle.rows)) {
  throw new Error('DOMAIN_LABEL_BUNDLE_SCHEMA_INVALID');
}
const rows = bundle.rows.slice(0, limit);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
const counts = {};
const bump = (key) => { counts[key] = (counts[key] ?? 0) + 1; };
const observations = [];
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout='30000'");
  const membership = await client.query(`
    SELECT repository_relative_path, source_ref, workspace_revision,
           code_source_revision, content_hash
    FROM graphify_execution_file_membership_v2
    WHERE execution_id = $1 AND repository_id = 'repo:root'
    ORDER BY source_ref`, [executionId]);
  const membershipByRef = new Map();
  for (const row of membership.rows) {
    for (const alias of sourceAliases(row.source_ref)) membershipByRef.set(alias, row);
  }
  const refs = [...new Set(rows.flatMap((row) => sourceAliases(row.sourceRef)))];
  const packetResult = await client.query(`
    SELECT packet_key, source_ref, source_revision, content_hash,
           workspace_revision_key, lineage_binding_checksum
    FROM atlas_packets
    WHERE source_ref = ANY($1::text[])
    ORDER BY packet_key`, [refs]);
  const packetsByRef = new Map();
  for (const row of packetResult.rows) {
    for (const alias of sourceAliases(row.source_ref)) {
      const list = packetsByRef.get(alias) ?? [];
      list.push(row);
      packetsByRef.set(alias, list);
    }
  }
  for (const row of rows) {
    const aliases = sourceAliases(row.sourceRef);
    const membershipRow = aliases.map((alias) => membershipByRef.get(alias)).find(Boolean) ?? null;
    const packetRows = aliases.flatMap((alias) => packetsByRef.get(alias) ?? []);
    const distinctPackets = [...new Map(packetRows.map((packet) => [packet.packet_key, packet])).values()];
    const sourcePath = path.resolve(REPO_ROOT, row.sourceRef);
    const observation = {
      sourceRef: row.sourceRef,
      weakLabel: row.weakLabel ?? null,
      contentChecksum: row.contentChecksum ?? null,
      sourceRevision: row.sourceRevision ?? null,
      workspaceRevision,
      executionId,
      packetKeys: distinctPackets.map((packet) => packet.packet_key),
      packetCandidates: distinctPackets.map((packet) => ({
        packetKey: packet.packet_key,
        sourceRef: packet.source_ref,
        sourceRevision: packet.source_revision ?? null,
        contentHash: packet.content_hash ?? null,
        workspaceRevisionKey: packet.workspace_revision_key ?? null,
      })),
    };
    let liveDigest = null;
    if (fs.existsSync(sourcePath)) liveDigest = sha256(fs.readFileSync(sourcePath));
    observation.liveContentDigest = liveDigest;
    if (!membershipRow) {
      observation.status = 'UNJOINABLE'; bump(observation.status); observations.push(observation); continue;
    }
    if (membershipRow.workspace_revision !== workspaceRevision) {
      observation.status = 'STALE_WORKSPACE_REVISION'; bump(observation.status); observations.push(observation); continue;
    }
    if (row.sourceRevision && membershipRow.code_source_revision !== row.sourceRevision) {
      observation.status = 'STALE_SOURCE_REVISION'; bump(observation.status); observations.push(observation); continue;
    }
    if (liveDigest && row.contentChecksum && liveDigest !== row.contentChecksum.replace(/^sha256:/, '')) {
      observation.status = 'CONTENT_DIGEST_MISMATCH'; bump(observation.status); observations.push(observation); continue;
    }
    if (distinctPackets.length === 0) {
      observation.status = 'PACKET_MISSING'; bump(observation.status); observations.push(observation); continue;
    }
    const expectedDigest = liveDigest ?? row.contentChecksum?.replace(/^sha256:/, '') ?? null;
    const expectedSourceRevision = row.sourceRevision ?? (expectedDigest ? `sha256:${expectedDigest}` : null);
    const exactPackets = distinctPackets.filter((packet) =>
      typeof packet.packet_key === 'string' && packet.packet_key.length > 0 &&
      packet.workspace_revision_key === workspaceRevision &&
      packet.source_revision === expectedSourceRevision && packet.content_hash === expectedDigest);
    if (exactPackets.length === 1) {
      const packet = exactPackets[0];
      observation.packetKey = packet.packet_key;
      observation.status = 'CURRENT_ADMITTED'; bump(observation.status); observations.push(observation); continue;
    }
    if (distinctPackets.length !== 1) {
      const allUnqualified = distinctPackets.every((packet) =>
        packet.source_revision == null && packet.content_hash == null && packet.workspace_revision_key == null);
      observation.status = allUnqualified ? 'PACKET_DUPLICATE_UNQUALIFIED' : 'PACKET_AMBIGUOUS';
      bump(observation.status); observations.push(observation); continue;
    }
    const packet = distinctPackets[0];
    observation.packetKey = packet.packet_key;
    const packetCurrent = packet.workspace_revision_key === workspaceRevision &&
      packet.source_revision === expectedSourceRevision && packet.content_hash === expectedDigest;
    if (!packetCurrent) {
      observation.status = packet.source_revision == null && packet.content_hash == null
        ? 'PACKET_UNQUALIFIED'
        : 'CONTENT_DIGEST_MISMATCH';
      bump(observation.status); observations.push(observation); continue;
    }
    observation.status = 'CURRENT_ADMITTED'; bump(observation.status); observations.push(observation);
  }
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}

const admittedRows = observations.filter((row) => row.status === 'CURRENT_ADMITTED');
const trainingManifestChecksum = `sha256:${sha256(JSON.stringify(admittedRows.map((row) => ({
  sourceRef: row.sourceRef, packetKey: row.packetKey, contentChecksum: row.contentChecksum,
  weakLabel: row.weakLabel,
})).sort((a, b) => a.sourceRef.localeCompare(b.sourceRef))))}`;
const report = {
  schema: 'atlas.domain-classifier-cohort-admission.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  labelsFile: path.relative(REPO_ROOT, labelsFile).replaceAll('\\', '/'),
  labelsBundleSchema: bundle.schema,
  labelsBundleChecksum: `sha256:${sha256(fs.readFileSync(labelsFile))}`,
  taxonomyRevision: bundle.taxonomyRevision ?? null,
  executionId,
  workspaceRevision,
  identityIndex: { canonicalIdentity: false, source: 'database packet_key returned by the canonical packet query' },
  rowLimit: limit,
  rowCount: rows.length,
  counts,
  ambiguousTrainingIdentities: counts.PACKET_AMBIGUOUS ?? 0,
  conflictingRevisions: (counts.STALE_WORKSPACE_REVISION ?? 0) + (counts.STALE_SOURCE_REVISION ?? 0),
  trainingManifestChecksum,
  promotionEligible: rows.length > 0 && rows.length === admittedRows.length &&
    (counts.PACKET_AMBIGUOUS ?? 0) === 0 && (counts.STALE_WORKSPACE_REVISION ?? 0) === 0 &&
    (counts.STALE_SOURCE_REVISION ?? 0) === 0 && (counts.CONTENT_DIGEST_MISMATCH ?? 0) === 0 &&
    (counts.PACKET_UNQUALIFIED ?? 0) === 0 && (counts.PACKET_MISSING ?? 0) === 0 &&
    (counts.PACKET_DUPLICATE_UNQUALIFIED ?? 0) === 0 && (counts.UNJOINABLE ?? 0) === 0,
  observations,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, counts, trainingManifestChecksum,
  promotionEligible: report.promotionEligible, writesPerformed: false,
  reportPath: path.relative(REPO_ROOT, reportPath) }, null, 2));
