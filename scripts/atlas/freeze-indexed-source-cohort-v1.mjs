import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readIndexedSourceDirectoryRowsV1 } from './audit-indexed-source-batch-v1.mjs';
import { buildIndexedSourceCohortV1 } from './lib/indexed-source-cohort-v1.mjs';
import { REPO_ROOT } from './connection-config.mjs';

const [directory, workspaceRevision] = process.argv.slice(2);
const snapshotRoot = fs.realpathSync(process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT);
const snapshotRevision = `sha256:${path.basename(snapshotRoot)}`;
const sourceRows = await readIndexedSourceDirectoryRowsV1({ directory, workspaceRevision }, {}, true);
const sourceDirectory = path.resolve(snapshotRoot, directory);
const sourcePaths = [];
const visit = (current, relative) => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) visit(path.join(current, entry.name), `${relative}/${entry.name}`);
    else if (entry.isFile() && /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs|svelte)$/i.test(entry.name)) sourcePaths.push(`${relative}/${entry.name}`);
  }
};
visit(sourceDirectory, directory);
const report = buildIndexedSourceCohortV1({ directory, workspaceRevision, snapshotRevision, sourceRows, sourcePaths,
  readSource: sourceRef => {
    const sourcePath = fs.realpathSync(path.join(snapshotRoot, sourceRef));
    const relative = path.relative(snapshotRoot, sourcePath);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    return fs.readFileSync(sourcePath);
  } });
const outputPath = path.join(REPO_ROOT, '.tmp/atlas', `indexed-source-frozen-cohort-${Date.now()}.json`);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...report, entries: undefined, reportPath: path.relative(REPO_ROOT, outputPath) }));
