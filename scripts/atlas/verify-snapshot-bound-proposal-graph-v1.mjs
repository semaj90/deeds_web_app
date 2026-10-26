#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySnapshotBoundProposalGraphV1 } from './lib/snapshot-bound-proposal-graph-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpAtlasRoot = realpathSync(path.resolve(root, '.tmp/atlas')) + path.sep;
const graphArg = process.argv.slice(2).find((arg) => arg.startsWith('--graph='))?.slice('--graph='.length);
if (!graphArg) throw new Error('USAGE: node scripts/atlas/verify-snapshot-bound-proposal-graph-v1.mjs --graph=.tmp/atlas/<graph.json>');

const graphPath = realpathSync(path.resolve(root, graphArg));
if (!graphPath.startsWith(tmpAtlasRoot)) throw new Error('GRAPH_PATH_OUTSIDE_TMP_ATLAS');
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const result = verifySnapshotBoundProposalGraphV1(graph, {
  requireSnapshotLineage: true,
  readArtifactBytes(relativePath) {
    const artifactPath = realpathSync(path.resolve(root, relativePath));
    if (!artifactPath.startsWith(tmpAtlasRoot)) throw new Error('ARTIFACT_PATH_OUTSIDE_TMP_ATLAS');
    return readFileSync(artifactPath);
  },
});

console.log(JSON.stringify({ graphPath: path.relative(root, graphPath).replace(/\\/g, '/'), ...result }, null, 2));
if (result.status !== 'VERIFIED_PROPOSAL_GRAPH') process.exitCode = 1;
