import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/atlas/verify-feature-lineage.mjs');

test('reports a failed verification through the process exit code and writes only to the requested output directory', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-feature-lineage-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputMap = path.join(directory, 'directory-source-map.jsonl');
  const outputDirectory = path.join(directory, 'verification');
  fs.writeFileSync(inputMap, `${JSON.stringify({
    directory_path: 'scripts/atlas',
    source_ref: 'scripts_atlas',
    feature_id: '123456789abc',
    feature_label: 'Atlas scripts',
    qdrant_collection: 'codebase_chunks_768',
    redis_centroid_key: 'centroid:directory:scripts_atlas:123456789abc',
    packet_count: 0,
    summary_count: 0,
    cold_storage_status: 'not_archived',
    file_count: 1,
  })}\n`, 'utf8');

  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.POSTGRES_URL;
  const result = spawnSync(process.execPath, [
    script,
    `--input-map=${inputMap}`,
    `--output-dir=${outputDirectory}`,
    '--strict',
  ], { cwd: root, env: environment, encoding: 'utf8' });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /LINEAGE VERIFICATION FAILED/);
  assert.match(result.stdout + result.stderr, /DATABASE_URL or POSTGRES_URL must be configured/);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'feature-lineage-verification.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'docs/reports/feature-lineage-verification.json')), true);
});
