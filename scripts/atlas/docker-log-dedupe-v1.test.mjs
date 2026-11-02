import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeLines, templateOf, unwrapDockerLine } from './docker-log-dedupe-v1.mjs';

const err = (pid, n) =>
  `2026-11-02 06:49:42.${String(n).padStart(3, '0')} UTC [${pid}] ERROR:  column "citation_type" does not exist at character ${140 + n}`;

test('unwraps docker json-file lines and leaves plain lines alone', () => {
  assert.equal(unwrapDockerLine('{"log":"hello\\n","stream":"stderr","time":"t"}'), 'hello');
  assert.equal(unwrapDockerLine('plain'), 'plain');
  assert.equal(unwrapDockerLine('{"log": broken'), '{"log": broken');
});

test('same error with different pid, time and offsets collapses to one template', () => {
  const a = templateOf(err(20156, 1));
  const b = templateOf(err(20176, 2));
  assert.equal(a.key, b.key);
  assert.equal(a.level, 'ERROR');
  assert.match(a.key, /"citation_type"/); // identifiers are kept
});

test('string literals and uuids are masked but identifiers are not', () => {
  const t = templateOf(`2026-11-02 06:49:42.000 UTC [1] ERROR:  duplicate key 'abc' for 3f2b8a1e-1111-4222-8333-444455556666`);
  assert.equal(t.key, 'ERROR: duplicate key <str> for <uuid>');
});

test('dedupe counts, orders by count and reports a saving', () => {
  const lines = [];
  for (let i = 0; i < 50; i++) lines.push(err(100 + i, i));
  lines.push('2026-11-02 06:50:00.000 UTC [9] LOG:  checkpoint complete');
  lines.push('');
  const { stats, templates } = dedupeLines(lines, { top: 5 });
  assert.equal(stats.recordsIn, 51);
  assert.equal(stats.distinctTemplates, 2);
  assert.equal(templates[0].count, 50);
  assert.ok(stats.distinctTemplatesHllEstimate >= 1 && stats.distinctTemplatesHllEstimate <= 3);
  assert.ok(stats.estSavingsPctShown > 50);
});

test('multi-line statements join one record and count once', () => {
  const lines = [
    '2026-11-02 06:49:42.512 UTC [1] ERROR:  column "x" does not exist at character 9',
    '2026-11-02 06:49:42.512 UTC [1] STATEMENT:  select "a",',
    '    "b" from t',
    '2026-11-02 06:49:43.000 UTC [2] LOG:  checkpoint complete',
  ];
  const { stats } = dedupeLines(lines);
  assert.equal(stats.recordsIn, 3);
});

test('samples are redacted, and --no-sample omits them', () => {
  const l = "2026-11-02 06:49:42.000 UTC [1] LOG:  connect postgres://u:hunter2@h/db password=abc123 Bearer abcdefgh12345678";
  const withS = dedupeLines([l]).templates[0].sample;
  assert.ok(!/hunter2|abc123|abcdefgh12345678/.test(withS), withS);
  assert.equal(dedupeLines([l], { sample: false }).templates[0].sample, undefined);
});

test('redacts JSON-style quoted secret keys', async () => {
  const { redact } = await import('./docker-log-dedupe-v1.mjs');
  const output = redact('{"api_key":"sk-123456789","password":"hunter2"}');
  assert.doesNotMatch(output, /sk-123456789|hunter2/);
  assert.match(output, /"api_key":<redacted>/);
  assert.match(output, /"password":<redacted>/);
});

test('streaming push matches batch dedupe', async () => {
  const { createDeduper } = await import('./docker-log-dedupe-v1.mjs');
  const lines = Array.from({ length: 30 }, (_, i) => err(i, i));
  const d = createDeduper();
  for (const l of lines) d.push(l);
  assert.deepEqual(d.finish().stats, dedupeLines(lines).stats);
});
