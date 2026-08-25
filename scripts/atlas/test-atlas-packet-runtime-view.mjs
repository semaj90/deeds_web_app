import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const sqlPath = `${root}sveltekit-frontend\\drizzle\\manual\\20260825_atlas_packet_runtime_view_v1.sql`;
const validatorPath = `${root}packages\\parent-atlas\\src\\core\\packet-validator-materializer.ts`;
const sql = fs.readFileSync(sqlPath, 'utf8');
const validator = fs.readFileSync(validatorPath, 'utf8');

test('runtime view owns the canonical packet read boundary', () => {
  assert.match(sql, /CREATE OR REPLACE VIEW public\.atlas_packet_runtime_v1/);
  for (const token of ['FROM public.atlas_packets p', 'LEFT JOIN public.atlas_packet_features f', 'LEFT JOIN public.atlas_packet_metrics m', 'p.packet_key', 'p.embedding AS embedding_768d', 'p.workspace_revision']) {
    assert.match(sql, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});

test('feature-directory context groups canonical packet evidence', () => {
  assert.match(sql, /CREATE OR REPLACE VIEW public\.atlas_feature_directory_context_v1/);
  for (const token of ['feature_key', 'feature_label', 'source_refs', 'file_urls', 'packet_context', 'JSONB_BUILD_OBJECT', 'FROM public.atlas_packet_runtime_v1']) {
    assert.match(sql, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('PacketValidator reads the runtime view and not the legacy registry', () => {
  assert.match(validator, /SELECT \* FROM atlas_packet_runtime_v1 WHERE packet_key = \$1/);
  assert.doesNotMatch(validator, /SELECT \* FROM atlas_packet_registry WHERE packet_key/);
});
