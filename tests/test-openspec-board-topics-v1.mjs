#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report = JSON.parse(fs.readFileSync('docs/reports/openspec-topic-clusters-v1.json', 'utf8'));

assert.equal(report.schema, 'atlas.openspec-topic-clusters.v1');
assert.ok(report.counts.tasks > 0);
assert.ok(report.counts.topics >= 10, 'current ranker lanes must not collapse into one topic');
assert.ok(report.counts.changes > 0);
assert.ok(report.counts.referencedFiles > 0);
assert.ok(report.topics.some((row) => row.topic === 'IDENTITY_AUTHORITY'));
assert.ok(report.topics.some((row) => row.topic === 'PREFILL_CONTEXT'));
assert.ok(report.topics.some((row) => row.topic === 'ACE_BITFROST_CACHE'));
assert.equal(report.writesPerformed, false);

console.log('openspec-board-topics-v1: PASS');
