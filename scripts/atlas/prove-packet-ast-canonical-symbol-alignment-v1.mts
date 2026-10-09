import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { matchPacketAstObservationsToCanonicalSymbolsV1 } from './lib/packet-ast-canonical-symbol-crosswalk-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...parts] = argument.replace(/^--/, '').split('=');
  return [key, parts.join('=')];
}));
const observationsPath = path.resolve(ROOT, args.get('observations') ?? '');
const bridgeReceiptPath = path.resolve(ROOT, args.get('bridge-receipt') ?? '');
const workspaceRevision = args.get('workspace-revision') ?? '';
const outputPath = path.resolve(ROOT, args.get('output') ?? '');
const scratchRoot = `${path.resolve(ROOT, '.tmp', 'atlas')}${path.sep}`;
if (!observationsPath.startsWith(scratchRoot) || !bridgeReceiptPath.startsWith(scratchRoot)
  || !outputPath.startsWith(scratchRoot) || !/^sha256:[a-f0-9]{64}$/.test(workspaceRevision)) {
  throw new Error('SCRATCH_INPUTS_AND_EXPLICIT_WORKSPACE_REVISION_REQUIRED');
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bridgeReceipt = JSON.parse(fs.readFileSync(bridgeReceiptPath, 'utf8'));
if (bridgeReceipt.schema !== 'atlas.ast-prefill-observation-bridge-receipt.v1'
  || bridgeReceipt.canonicalAuthority !== false
  || bridgeReceipt.persistentStoreWritesPerformed !== false
  || path.resolve(ROOT, bridgeReceipt.outputPath) !== observationsPath) {
  throw new Error('BRIDGE_RECEIPT_NOT_BOUND_TO_OBSERVATIONS');
}
const observationBytes = fs.readFileSync(observationsPath);
const observationChecksum = sha256(observationBytes);
if (observationChecksum !== bridgeReceipt.outputChecksum || observationChecksum !== bridgeReceipt.readbackChecksum) {
  throw new Error('BRIDGE_READBACK_CHECKSUM_MISMATCH');
}
const observations = observationBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (observations.length === 0 || observations.length !== bridgeReceipt.projectedRows) throw new Error('OBSERVATION_COUNT_MISMATCH');

const binding = observations[0];
const packetKey = binding.packetKey;
const sourceRef = binding.sourceRef;
const sourceRevision = binding.sourceRevision;
if (!packetKey || !sourceRef || !sourceRevision || binding.workspaceRevision !== workspaceRevision
  || binding.identityStatus !== 'PACKET_REFERENCE') throw new Error('PACKET_LINEAGE_INCOMPLETE');
for (const row of observations) {
  const observation = row.observation;
  if (row.schema !== 'atlas.ast-prefill-observation-bridge-row.v1'
    || row.packetKey !== packetKey || row.sourceRef !== sourceRef || row.sourceRevision !== sourceRevision
    || row.workspaceRevision !== workspaceRevision || row.admissionStatus !== 'PROPOSAL_ONLY'
    || row.canonicalAuthority !== false || observation?.canonical_authority !== false
    || observation.source_ref !== sourceRef || observation.source_revision !== sourceRevision) {
    throw new Error('OBSERVATION_PACKET_OR_REVISION_CONFLICT');
  }
}

const sourcePath = path.resolve(ROOT, sourceRef);
const sourceRealPath = fs.realpathSync(sourcePath);
const relativeSource = path.relative(fs.realpathSync(ROOT), sourceRealPath);
if (!relativeSource || relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) throw new Error('SOURCE_PATH_ESCAPES_REPOSITORY');
const sourceBytes = fs.readFileSync(sourceRealPath);
if (`sha256:${sha256(sourceBytes)}` !== sourceRevision) throw new Error('SOURCE_REVISION_READBACK_MISMATCH');
for (const row of observations) {
  const observation = row.observation;
  const start = observation.byte_start;
  const end = observation.byte_end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceBytes.length) {
    throw new Error('OBSERVATION_SPAN_INVALID');
  }
  const span = sourceBytes.subarray(start, end);
  if (sha256(span) !== observation.matched_text_hash) throw new Error('OBSERVATION_SPAN_CHECKSUM_MISMATCH');
  if (typeof observation.captures?.name !== 'string' || !span.includes(Buffer.from(observation.captures.name, 'utf8'))) {
    throw new Error('OBSERVATION_NAME_NOT_IN_SPAN');
  }
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 12000 });
const client = await pool.connect();
let packetRows: Array<Record<string, any>> = [];
let bindingRows: Array<Record<string, any>> = [];
let symbolRows: Array<Record<string, any>> = [];
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '10000ms'");
  packetRows = (await client.query(`
    SELECT packet_key, source_ref, source_revision, workspace_revision_key, source_kind
    FROM public.atlas_packets
    WHERE packet_key = $1 AND source_ref = $2 AND source_revision = $3 AND workspace_revision_key = $4
  `, [packetKey, sourceRef, sourceRevision, workspaceRevision])).rows;
  bindingRows = (await client.query(`
    SELECT canonical_source_ref, source_revision, workspace_revision, content_digest
    FROM public.atlas_workspace_source_bindings
    WHERE repo_id = 'deeds-web-app' AND canonical_source_ref = $1
      AND source_revision = $2 AND workspace_revision = $3
  `, [sourceRef, sourceRevision, workspaceRevision])).rows;
  symbolRows = (await client.query(`
    SELECT v.packet_key, v.source_ref, v.source_revision, v.workspace_revision,
      v.symbol_version_id, v.stable_symbol_id, v.qualified_name, v.byte_start, v.byte_end,
      r.status AS registry_status
    FROM public.atlas_symbol_versions v
    JOIN public.atlas_symbol_registry r ON r.stable_symbol_id = v.stable_symbol_id
    WHERE v.packet_key = $1 AND v.source_ref = $2 AND v.source_revision = $3
      AND v.workspace_revision = $4
    ORDER BY v.byte_start, v.symbol_version_id
  `, [packetKey, sourceRef, sourceRevision, workspaceRevision])).rows.map((row) => ({
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    symbolVersionId: row.symbol_version_id,
    stableSymbolId: row.stable_symbol_id,
    qualifiedName: row.qualified_name,
    byteStart: row.byte_start,
    byteEnd: row.byte_end,
    registryStatus: row.registry_status,
  }));
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

if (packetRows.length !== 1 || packetRows[0].source_kind !== 'codebase_chunk') throw new Error('EXACT_PACKET_BINDING_NOT_UNIQUE_OR_INELIGIBLE');
if (bindingRows.length !== 1 || bindingRows[0].content_digest !== sha256(sourceBytes)) throw new Error('EXACT_WORKSPACE_SOURCE_BINDING_NOT_UNIQUE');
const crosswalk = matchPacketAstObservationsToCanonicalSymbolsV1({
  observations,
  symbols: symbolRows,
  packetKey,
  sourceRef,
  sourceRevision,
  workspaceRevision,
});
if (symbolRows.length === 0 || crosswalk.matches.length === 0 || crosswalk.ambiguous.length > 0 || !crosswalk.exactOneToOne) {
  throw new Error('CANONICAL_SYMBOL_OBSERVATION_ALIGNMENT_NOT_PROVEN');
}

const payload = {
  schema: 'atlas.packet-ast-canonical-symbol-alignment-receipt.v1',
  status: crosswalk.allStoredVersionsMatched ? 'EXACT_PACKET_CANONICAL_SYMBOL_AST_ALIGNMENT' : 'PARTIAL_PACKET_CANONICAL_SYMBOL_AST_ALIGNMENT',
  packetKey,
  sourceRef,
  sourceRevision,
  workspaceRevision,
  sourceChecksum: `sha256:${sha256(sourceBytes)}`,
  workspaceBindingCount: bindingRows.length,
  packetBindingCount: packetRows.length,
  observationArtifact: path.relative(ROOT, observationsPath).replaceAll('\\', '/'),
  bridgeReceipt: path.relative(ROOT, bridgeReceiptPath).replaceAll('\\', '/'),
  observationArtifactChecksum: observationChecksum,
  observationCount: observations.length,
  activeCanonicalSymbolVersionCount: symbolRows.filter((row) => row.registryStatus === 'active').length,
  exactMatches: crosswalk.matches,
  unmatchedObservations: crosswalk.unmatched,
  ambiguousObservations: crosswalk.ambiguous,
  allStoredVersionsMatched: crosswalk.allStoredVersionsMatched,
  exactOneToOne: crosswalk.exactOneToOne,
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  databaseTransaction: 'REPEATABLE_READ_READ_ONLY_ROLLED_BACK',
};
const receipt = { ...payload, checksum: sha256(Buffer.from(JSON.stringify(payload), 'utf8')) };
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const { checksum, ...readbackPayload } = readback;
if (checksum !== sha256(Buffer.from(JSON.stringify(readbackPayload), 'utf8'))) throw new Error('RECEIPT_READBACK_CHECKSUM_MISMATCH');
process.stdout.write(`${JSON.stringify({ status: readback.status, packetKey, observationCount: readback.observationCount, canonicalSymbolVersions: readback.activeCanonicalSymbolVersionCount, exactMatches: readback.exactMatches.length, unmatched: readback.unmatchedObservations.length, readback: 'MATCH', writes: false, output: path.relative(ROOT, outputPath) }, null, 2)}\n`);
