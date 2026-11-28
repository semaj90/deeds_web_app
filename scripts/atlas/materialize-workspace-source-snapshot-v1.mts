import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const root = process.cwd();
const snapshotArgument = process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length);
if (!snapshotArgument) throw new Error('SNAPSHOT_MISSING');
const snapshotPath = path.resolve(root, snapshotArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Parameters<typeof validateSnapshot>[0];
if (snapshot.schema !== 'atlas.workspace-source-snapshot-capture.v1'
    || !/^sha256:[0-9a-f]{64}$/.test(snapshot.snapshotRevision)
    || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
  throw new Error('SNAPSHOT_INVALID');
}

const revision = snapshot.snapshotRevision.slice('sha256:'.length);
const destination = path.resolve(root, '.tmp', 'workspace-source-snapshots', revision);
const stage = `${destination}.partial-${process.pid}`;
const sourceRoot = realpathSync(snapshot.repositoryRoot);

function within(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function verifyMaterialization(directory: string) {
  const readback = validateSnapshot(snapshot, { sourceReadRoot: directory });
  if (readback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN') {
    throw new Error(`SNAPSHOT_MATERIALIZATION_READBACK_BLOCKED:${readback.violations[0]}`);
  }
  return readback;
}

const reused = existsSync(destination);
let readback;
if (reused) {
  readback = verifyMaterialization(destination);
} else {
  mkdirSync(path.dirname(stage), { recursive: true });
  mkdirSync(stage);
  for (const source of snapshot.sources) {
    const sourceFile = path.resolve(sourceRoot, source.repositoryPath ?? '', source.repositoryRelativePath ?? source.sourceRef);
    const targetFile = path.resolve(stage, source.sourceRef);
    if (!within(stage, targetFile) || !within(sourceRoot, sourceFile) || !existsSync(sourceFile)
        || !within(sourceRoot, realpathSync(sourceFile)) || !lstatSync(sourceFile).isFile()) {
      throw new Error(`SNAPSHOT_SOURCE_UNAVAILABLE:${source.sourceRef}`);
    }
    const bytes = readFileSync(sourceFile);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== source.contentDigest || bytes.byteLength !== source.byteLength) {
      throw new Error(`SNAPSHOT_SOURCE_CHANGED_BEFORE_MATERIALIZATION:${source.sourceRef}`);
    }
    // Write the verified buffer itself so a concurrent source edit cannot change the copied bytes.
    mkdirSync(path.dirname(targetFile), { recursive: true });
    writeFileSync(targetFile, bytes, { flag: 'wx' });
  }
  readback = verifyMaterialization(stage);
  writeFileSync(path.join(stage, '.materialization.json'), JSON.stringify({
    schema: 'atlas.workspace-source-materialization.v1', snapshotRevision: snapshot.snapshotRevision,
    sourceCount: snapshot.sources.length, readbackStatus: readback.status,
  }, null, 2) + '\n', { flag: 'wx' });
  renameSync(stage, destination);
}

console.log(JSON.stringify({
  schema: 'atlas.workspace-source-materialization.v1', status: 'MATERIALIZED',
  snapshotRevision: snapshot.snapshotRevision, sourceCount: snapshot.sources.length,
  materializedRoot: destination, readbackStatus: readback.status, exactMatches: readback.exactMatches,
  reused, localArtifactWritesPerformed: !reused, writesPerformed: false, datastoreWritesPerformed: false,
}, null, 2));
