import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const script = path.join(root, 'scripts/atlas/build-emb2-semantic-card-embeddings.mjs');
const scratch = path.join(root, '.tmp', `emb2-script-regression-${process.pid}`);

test('rejects report destinations outside ignored scratch storage', () => {
  const unsafePath = path.join('docs', 'reports', `emb2-unsafe-${process.pid}.jsonl`);
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, EMB2_OUTPUT: unsafePath },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EMB2_OUTPUT_MUST_BE_UNDER_REPO_TMP/);
});

test('emits shape-checked but explicitly unqualified diagnostic vectors', async () => {
  mkdirSync(scratch, { recursive: true });
  const inputPath = path.join(scratch, 'cards.jsonl');
  const outputPath = path.join(scratch, 'embeddings.jsonl');
  writeFileSync(inputPath, `${JSON.stringify({
    cardId: 'fixture-card-1',
    kind: 'function',
    name: 'fixture',
    sourceRef: 'fixture/example.ts',
    sourceRevision: 'sha256:fixture-source',
    workspaceRevision: 'sha256:fixture-workspace',
    representationRevision: null,
    contextualizedText: 'fixture input only',
  })}\n`);

  const server = createServer((request, response) => {
    if (request.url !== '/api/embeddings') {
      response.writeHead(404).end();
      return;
    }
    const embedding = new Array(768).fill(0);
    embedding[0] = 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ embedding }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        EMB1_INPUT: inputPath,
        EMB2_OUTPUT: outputPath,
        OLLAMA_URL: `http://127.0.0.1:${address.port}`,
        EMBED_MODEL: 'fixture-embedding-model',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [exitCode, stdout, stderr] = await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve([code, out, err]));
    });
    assert.equal(exitCode, 0, `${stdout}\n${stderr}`);

    const proof = JSON.parse(readFileSync(path.join(scratch, 'embedding-proof.json'), 'utf8'));
    const [record] = readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(proof.status, 'DIAGNOSTIC_ONLY');
    assert.equal(proof.runtimeBinding, 'UNPROVEN');
    assert.equal(proof.representationRevision, null);
    assert.equal(proof.canonicalAuthority, false);
    assert.equal(proof.promotionEligible, false);
    assert.equal(record.candidateRepresentationId, 'semantic_768');
    assert.equal(record.representationId, null);
    assert.equal(record.representationRevision, null);
    assert.equal(record.canonicalAuthority, false);
    assert.equal(record.promotionEligible, false);
    assert.equal(record.vector.length, 768);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
