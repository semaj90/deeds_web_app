#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { loadConfig, resolveRepoPath, readJson } from './_atlas-utils.mjs';

const config = loadConfig();
const manifestPath = resolveRepoPath(config.outputs.writeManifest || 'docs/graph/atlas-write-manifest.json');

if (!existsSync(manifestPath)) {
  console.error(`Error: Manifest not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = readJson(manifestPath);
console.log(`Validating Atlas write manifest [runId: ${manifest.runId}]`);

if (manifest.repo !== config.repoName) {
  console.error(`Error: Repo mismatch. Manifest: ${manifest.repo}, Config: ${config.repoName}`);
  process.exit(1);
}

console.log('Safety Checks:');
console.log(`- No Hidden Thoughts: ${manifest.safety.noHiddenThoughts ? '✅' : '❌'}`);
console.log(`- No Raw Tensors: ${manifest.safety.noRawTensors ? '✅' : '❌'}`);
console.log(`- No KV Cache: ${manifest.safety.noKvCache ? '✅' : '❌'}`);

console.log('Target Counts:');
for (const [target, data] of Object.entries(manifest.targets)) {
  console.log(`- ${target}: ${JSON.stringify(data)}`);
}

console.log('Manifest validation passed.');
