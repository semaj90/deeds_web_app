import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadLatestOpenSpecCensus } from './openspec-census-selector-v1.mjs';

function withReportsRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-census-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeCensus(root, run, value) {
  const directory = path.join(root, 'openspec-evidence', run);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'census-v1.json'), JSON.stringify(value));
}

test('skips newer run directories without a census file', () => {
  withReportsRoot((root) => {
    writeCensus(root, 'run-20261003', { generatedAt: '2026-10-03T04:00:00Z', censusStatus: 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE' });
    fs.mkdirSync(path.join(root, 'openspec-evidence', 'pipeline-attempt-20261011'), { recursive: true });

    assert.deepEqual(loadLatestOpenSpecCensus(root), { generatedAt: '2026-10-03T04:00:00Z', censusStatus: 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE' });
  });
});

test('selects by generatedAt and ignores malformed reports', () => {
  withReportsRoot((root) => {
    writeCensus(root, 'run-newer-name', { generatedAt: '2026-10-02T04:00:00Z', marker: 'older' });
    writeCensus(root, 'run-older-name', { generatedAt: '2026-10-03T04:00:00Z', marker: 'newer' });
    const malformed = path.join(root, 'openspec-evidence', 'run-malformed');
    fs.mkdirSync(malformed, { recursive: true });
    fs.writeFileSync(path.join(malformed, 'census-v1.json'), '{');

    assert.equal(loadLatestOpenSpecCensus(root)?.marker, 'newer');
  });
});

test('uses the portfolio fallback only when no valid run census exists', () => {
  withReportsRoot((root) => {
    const fallback = { generatedAt: '2026-10-01T00:00:00Z', censusStatus: 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE' };
    fs.writeFileSync(path.join(root, 'openspec-evidence-portfolio-census-v2.json'), JSON.stringify(fallback));
    fs.mkdirSync(path.join(root, 'openspec-evidence', 'incomplete-run'), { recursive: true });

    assert.deepEqual(loadLatestOpenSpecCensus(root), fallback);
  });
});
