import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sha256Json = (value) => digest(Buffer.from(JSON.stringify(value), 'utf8'));

export function verifySourceOnlyAstPrefillReadbackV1({ repoRoot = ROOT, artifactPath, bridgeReceiptPath, workspaceRevision }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(workspaceRevision ?? '')) throw new Error('WORKSPACE_REVISION_REQUIRED');
  const artifact = path.resolve(repoRoot, artifactPath);
  const bridgeReceiptFile = path.resolve(repoRoot, bridgeReceiptPath);
  const bridgeReceipt = JSON.parse(fs.readFileSync(bridgeReceiptFile, 'utf8'));
  if (bridgeReceipt.schema !== 'atlas.ast-prefill-observation-bridge-receipt.v1'
    || bridgeReceipt.canonicalAuthority !== false
    || bridgeReceipt.persistentStoreWritesPerformed !== false
    || path.resolve(repoRoot, bridgeReceipt.outputPath).toLowerCase() !== artifact.toLowerCase()) {
    throw new Error('BRIDGE_RECEIPT_NOT_BOUND_TO_ARTIFACT');
  }

  const artifactBytes = fs.readFileSync(artifact);
  const artifactChecksum = digest(artifactBytes);
  if (artifactChecksum !== bridgeReceipt.outputChecksum || artifactChecksum !== bridgeReceipt.readbackChecksum) {
    throw new Error('BRIDGE_ARTIFACT_CHECKSUM_MISMATCH');
  }

  const lines = artifactBytes.toString('utf8').split(/\r?\n/).filter(Boolean);
  const rows = lines.map((line) => JSON.parse(line));
  if (rows.length === 0 || rows.length !== bridgeReceipt.projectedRows) throw new Error('EMPTY_OR_INCOMPLETE_ARTIFACT');
  const verified = [];
  for (const row of rows) {
    const observation = row.observation;
    if (row.schema !== 'atlas.ast-prefill-observation-bridge-row.v1'
      || row.admissionStatus !== 'PROPOSAL_ONLY'
      || row.canonicalAuthority !== false
      || row.identityStatus !== 'SOURCE_ONLY_UNBOUND'
      || row.packetKey !== null
      || row.workspaceRevision !== workspaceRevision
      || observation?.canonical_authority !== false
      || observation.source_ref !== row.sourceRef
      || observation.source_revision !== row.sourceRevision) {
      throw new Error('SOURCE_ONLY_LINEAGE_CONTRACT_MISMATCH');
    }

    const sourcePath = path.resolve(repoRoot, row.sourceRef);
    const relativeSource = path.relative(repoRoot, sourcePath);
    if (!relativeSource || relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
      throw new Error('SOURCE_PATH_ESCAPES_REPOSITORY');
    }
    const sourceBytes = fs.readFileSync(sourcePath);
    if (`sha256:${digest(sourceBytes)}` !== row.sourceRevision) throw new Error('SOURCE_REVISION_READBACK_MISMATCH');
    const start = observation.byte_start;
    const end = observation.byte_end;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceBytes.length) {
      throw new Error('SOURCE_SPAN_INVALID');
    }
    const span = sourceBytes.subarray(start, end);
    if (digest(span) !== observation.matched_text_hash) throw new Error('SOURCE_SPAN_CHECKSUM_MISMATCH');
    const capturedName = observation.captures?.name;
    if (typeof capturedName === 'string' && capturedName && !span.includes(Buffer.from(capturedName, 'utf8'))) {
      throw new Error('SOURCE_CAPTURE_NOT_IN_SPAN');
    }
    verified.push({ observationId: observation.observation_id, sourceRef: row.sourceRef, sourceRevision: row.sourceRevision, byteStart: start, byteEnd: end, spanChecksum: observation.matched_text_hash });
  }

  const payload = {
    schema: 'atlas.source-only-ast-prefill-independent-readback.v1',
    status: 'SOURCE_ONLY_OBSERVATION_READBACK_MATCH',
    workspaceRevision,
    inputArtifact: path.relative(repoRoot, artifact).replaceAll('\\', '/'),
    bridgeReceipt: path.relative(repoRoot, bridgeReceiptFile).replaceAll('\\', '/'),
    artifactChecksum,
    bridgeReceiptProjectedRows: bridgeReceipt.projectedRows,
    independentlyVerifiedRows: verified.length,
    sourceRevisionCount: new Set(verified.map((row) => row.sourceRevision)).size,
    identityStatus: 'SOURCE_ONLY_UNBOUND',
    packetIdentityCount: 0,
    symbolVersionIdentityCount: 0,
    canonicalAuthority: false,
    persistentStoreWritesPerformed: false,
    verifiedObservations: verified,
  };
  return { ...payload, checksum: sha256Json(payload) };
}

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...parts] = arg.replace(/^--/, '').split('=');
  return [key, parts.join('=')];
}));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifactPath = args.get('artifact');
  const bridgeReceiptPath = args.get('bridge-receipt');
  const outputPath = path.resolve(ROOT, args.get('output') ?? '');
  const scratchRoot = `${path.resolve(ROOT, '.tmp', 'atlas')}${path.sep}`;
  if (!artifactPath || !bridgeReceiptPath || !args.get('workspace-revision')) throw new Error('ARTIFACT_RECEIPT_AND_WORKSPACE_REVISION_REQUIRED');
  if (!outputPath.toLowerCase().startsWith(scratchRoot.toLowerCase())) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
  const receipt = verifySourceOnlyAstPrefillReadbackV1({
    artifactPath,
    bridgeReceiptPath,
    workspaceRevision: args.get('workspace-revision'),
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: receipt.status, independentlyVerifiedRows: receipt.independentlyVerifiedRows, checksum: receipt.checksum, outputPath: path.relative(ROOT, outputPath) }, null, 2)}\n`);
}
