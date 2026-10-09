import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEmbedAllowedPacketKeysV1, EMBED_ALLOWED_KEYSET_SCHEMA_V1, ENRICHMENT_READINESS_CTE_V1 } from './enrichment-readiness-sql-v1.mjs';

const fake = (rows, log = []) => ({ log, query: async (sql) => { log.push(sql.split('\n')[0].slice(0, 60)); return /packet_key, \(SELECT/.test(sql) ? { rows } : { rows: [] }; } });

test('keyset is read-only, sorted-checksummed, non-authoritative and uses the shared predicate', async () => {
  const c = fake([{ packet_key: 'a', total: 3 }, { packet_key: 'b', total: 3 }]);
  const r = await loadEmbedAllowedPacketKeysV1(c);
  assert.equal(r.schema, EMBED_ALLOWED_KEYSET_SCHEMA_V1);
  assert.deepEqual([...r.keys], ['a', 'b']);
  assert.equal(r.count, 2); assert.equal(r.totalPackets, 3);
  assert.match(r.keysSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(r.canonicalAuthority, false); assert.equal(r.admissionVerdict, null);
  assert.match(c.log[0], /READ ONLY/); assert.equal(c.log.at(-1), 'ROLLBACK');
  assert.ok(ENRICHMENT_READINESS_CTE_V1.includes('embed_allowed'));
});

test('empty set is returned as-is; blank or duplicate keys throw and still roll back', async () => {
  assert.equal((await loadEmbedAllowedPacketKeysV1(fake([]))).count, 0);
  for (const rows of [[{ packet_key: '', total: 1 }], [{ packet_key: 'a', total: 2 }, { packet_key: 'a', total: 2 }]]) {
    const c = fake(rows);
    await assert.rejects(loadEmbedAllowedPacketKeysV1(c), /EMBED_ALLOWED_KEYSET/);
    assert.equal(c.log.at(-1), 'ROLLBACK');
  }
});
