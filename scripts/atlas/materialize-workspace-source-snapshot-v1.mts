import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const snapshotPath = path.resolve(process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length) ?? '');
if (!snapshotPath || !existsSync(snapshotPath)) throw new Error('SNAPSHOT_MISSING');
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
  snapshotRevision?: string;
  repositoryRoot?: string;
  sources?: Array<{ sourceRef?: string; repositoryPath?: string; repositoryRelativePath?: string; contentDigest?: string; byteLength?: number }>;
};
if (!/^sha256:[0-9a-f]{64}$/i.test(snapshot.snapshotRevision ?? '') || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
  throw new Error('SNAPSHOT_INVALID');
}

const revision = snapshot.snapshotRevision!.slice('sha256:'.length);
const destination = path.resolve(root, '.tmp', 'workspace-source-snapshots', revision);
const stage = `${destination}.partial-${process.pid}`;
const sourceRoot = path.resolve(snapshot.repositoryRoot ?? root);

function digest(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (!existsSync(destination)) {
  mkdirSync(stage, { recursive: true });
  for (const source of snapshot.sources) {
    const relative = (source.sourceRef ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
    const sourceFile = path.resolve(sourceRoot, source.repositoryPath ?? '', source.repositoryRelativePath ?? relative);
    const targetFile = path.resolve(stage, relative);
    if (!targetFile.startsWith(stage + path.sep) || !existsSync(sourceFile)) throw new Error(`SNAPSHOT_SOURCE_UNAVAILABLE:${relative}`);
    const actual = digest(sourceFile);
    if (actual !== source.contentDigest || readFileSync(sourceFile).byteLength !== source.byteLength) {
      throw new Error(`SNAPSHOT_SOURCE_CHANGED_BEFORE_MATERIALIZATION:${relative}`);
    }
    mkdirSync(path.dirname(targetFile), { recursive: true });
    copyFileSync(sourceFile, targetFile);
    if (digest(targetFile) !== source.contentDigest) throw new Error(`SNAPSHOT_MATERIALIZATION_HASH_MISMATCH:${relative}`);
  }
  writeFileSync(path.join(stage, '.materialization.json'), JSON.stringify({ schema: 'atlas.workspace-source-materialization.v1', snapshotRevision: snapshot.snapshotRevision, sourceCount: snapshot.sources.length }, null, 2) + '\n');
  renameSync(stage, destination);
}

console.log(JSON.stringify({ schema: 'atlas.workspace-source-materialization.v1', status: 'MATERIALIZED', snapshotRevision: snapshot.snapshotRevision, sourceCount: snapshot.sources.length, materializedRoot: destination, writesPerformed: false }, null, 2));
