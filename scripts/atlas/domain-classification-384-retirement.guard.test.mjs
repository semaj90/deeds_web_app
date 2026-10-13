import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('operational readiness, routing, and monitoring readers do not accept legacy 384-D data', () => {
  const readers = [
    'scripts/atlas/domain-classification-readiness-audit.mjs',
    'scripts/atlas/route-hmm-output-to-kanban.mjs',
    'scripts/atlas/hyperrag-packet-materializer.mjs',
    'scripts/atlas/monitor-embedding-progress.mjs',
    'scripts/atlas/audit-topology-completion-gaps.mjs',
  ];

  for (const relativePath of readers) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
    assert.doesNotMatch(source, /content_embedding_384/, `${relativePath} still references the retired field`);
  }

  const readiness = readFileSync(resolve(repositoryRoot, readers[0]), 'utf8');
  assert.match(readiness, /key: 'content_embedding_768',[\s\S]{0,100}candidates: \['content_embedding_768'\]/);
});
