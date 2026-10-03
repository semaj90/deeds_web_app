import { describe, expect, it } from 'vitest';
import {
  ERR_BLOCKED_TERM, ERR_EVENT_ORDER_VIOLATION, ERR_INVALID_SOURCE_REF, ERR_MISSING_FEATURE_ID, ERR_MISSING_PACKET_KEY, ERR_UNKNOWN_TABLE, ERR_WRITE_ORDER_VIOLATION,
  extractSqlTablesV2, validateBlockedTermsV2, validateOperationOrderV2, validatePacketForAtlasV2, validateSourceRefV1, validateSqlAgainstAllowlistV2,
} from './packet-adversarial-validator-v2.js';

const good = { packet_key: 'packet:abc', source_ref: 'src/lib/a.ts', feature_id: 'auth.sessions', summary: 's', title: 't', embedding: true, ganValidated: true };

describe('validateSourceRefV1 (structural, not extension-based)', () => {
  it('accepts every kind of legitimate source seen live', () => {
    for (const ref of ['src/lib/a.ts', 'sveltekit-frontend/src/routes/(app)/evidence/[id]/+page.svelte', 'src/routes/api/x/+server.ts', 'scripts/atlas/build-x.mts', 'python/atlas_x.py',
      'docs/GPU-ACCELERATION-IMPLEMENTATION.md', 'src/lib/UpperCase.svelte', '.python311/lib/site.py', 'artifacts/schema.sql', 'assets/logo.png', 'Dockerfile/x', '6_10_todo.txt', 'README.md', 'Makefile.d', '$lib/utils/file-reader.ts', 'docs/My Notes v2.md', 'src/lib/café/über.ts', 'src/a..b.ts', 'src/routes/(app)/[id]/[[slug]]/+page.svelte', 'src/lib/Some+Thing.tsx', '.python-version', 'deeds-web-app.code-workspace']) {
      expect({ ref, ok: validateSourceRefV1(ref).ok }).toEqual({ ref, ok: true });
    }
    expect(validateSourceRefV1('proto:ChatAssistantService.CreateSession')).toEqual({ ok: true, namespace: 'SCHEME:proto' });
    expect(validateSourceRefV1('cluster:summary:0')).toEqual({ ok: true, namespace: 'SCHEME:cluster' });
    expect(validateSourceRefV1('src/a.ts')).toEqual({ ok: true, namespace: 'PATH' });
  });
  it('rejects structurally invalid refs with a specific reason', () => {
    const cases: Array<[unknown, string]> = [
      [null, 'NOT_A_STRING'], [7, 'NOT_A_STRING'], ['', 'EMPTY'], ['   ', 'EMPTY'], [' src/a.ts', 'LEADING_OR_TRAILING_WHITESPACE'], ['src/a.ts ', 'LEADING_OR_TRAILING_WHITESPACE'],
      ['src/a\u0000.ts', 'CONTROL_CHARACTER'], ['src/a\n.ts', 'CONTROL_CHARACTER'], ['src\\a.ts', 'BACKSLASH_SEPARATOR'], ['src//a.ts', 'EMPTY_PATH_SEGMENT'],
      ['/etc/passwd.ts', 'ABSOLUTE_PATH'], ['C:/x/a.ts', 'ABSOLUTE_PATH'], ['src/../../../etc/passwd', 'PATH_TRAVERSAL'], ['../a.ts', 'PATH_TRAVERSAL'],
      ['NOT_A_FILE_PATH', 'NO_PATH_STRUCTURE'], ['1', 'NO_PATH_STRUCTURE'], ['nul', 'NO_PATH_STRUCTURE'], ['utputFormat', 'NO_PATH_STRUCTURE'], ['--since 2h', 'NO_PATH_STRUCTURE'], ['src/dir/', 'DIRECTORY_NOT_A_SOURCE'],
      ['magic:thing', 'UNRECOGNIZED_SOURCE_NAMESPACE'], ['proto:', 'EMPTY_SCHEME_BODY'], ['x'.repeat(1025), 'TOO_LONG'],
    ];
    for (const [ref, reason] of cases) {
      const r = validateSourceRefV1(ref);
      expect({ ref: String(ref).slice(0, 30), ok: r.ok, reason: r.ok ? null : r.reason }).toEqual({ ref: String(ref).slice(0, 30), ok: false, reason });
      if (!r.ok) expect(r.code).toBe(ERR_INVALID_SOURCE_REF);
    }
  });
});

describe('validatePacketForAtlasV2', () => {
  it('passes a good packet with no warnings', () => {
    expect(validatePacketForAtlasV2(good, { requireTitle: true, requireGanFlag: true })).toEqual({ status: 'PASS', hardFailure: null, warnings: [] });
  });
  it('short-circuits in the fixed order packet_key, source_ref, feature_id with the historical probe ids', () => {
    expect(validatePacketForAtlasV2({ ...good, packet_key: '' })).toMatchObject({ status: 'HARD_FAIL', hardFailure: { code: ERR_MISSING_PACKET_KEY, reason: 'missing_packet_key', historicalProbe: 'ADV001' } });
    expect(validatePacketForAtlasV2({ ...good, packet_key: null })).toMatchObject({ hardFailure: { code: ERR_MISSING_PACKET_KEY } });
    expect(validatePacketForAtlasV2({ ...good, source_ref: 'NOT_A_FILE_PATH' })).toMatchObject({ hardFailure: { code: ERR_INVALID_SOURCE_REF, reason: 'invalid_source_ref', historicalProbe: 'ADV002' } });
    expect(validatePacketForAtlasV2({ ...good, feature_id: '' })).toMatchObject({ hardFailure: { code: ERR_MISSING_FEATURE_ID, reason: 'missing_feature_id', historicalProbe: 'ADV001' } });
    // order: everything wrong -> packet_key wins; source_ref + feature wrong -> source_ref wins
    expect(validatePacketForAtlasV2({ packet_key: '', source_ref: '', feature_id: '' })).toMatchObject({ hardFailure: { code: ERR_MISSING_PACKET_KEY } });
    expect(validatePacketForAtlasV2({ packet_key: 'p', source_ref: '', feature_id: '' })).toMatchObject({ hardFailure: { code: ERR_INVALID_SOURCE_REF } });
  });
  it('soft warnings depend on options, so absent columns never produce noise', () => {
    const bare = { packet_key: 'p', source_ref: 'a/b.ts', feature_id: 'f' };
    expect(validatePacketForAtlasV2(bare).warnings).toEqual(['missing_summary', 'missing_embedding']);
    expect(validatePacketForAtlasV2(bare, { requireTitle: true, requireGanFlag: true }).warnings).toEqual(['missing_summary', 'missing_title', 'missing_embedding', 'missing_gan_validation_flag']);
    expect(validatePacketForAtlasV2({ ...good, summary_confidence: 0.5 }).warnings).toEqual(['low_summary_confidence']);
  });
});

describe('SQL allowlist (ADV003 owner)', () => {
  const allow = ['users', 'atlas_packets', 'cases'];
  it('extracts tables', () => {
    expect(extractSqlTablesV2('SELECT a FROM public.Users u JOIN "cases" c ON 1=1')).toEqual(['users', 'cases']);
    expect(extractSqlTablesV2('INSERT INTO atlas_packets (a) VALUES ($1)')).toEqual(['atlas_packets']);
    expect(extractSqlTablesV2('UPDATE ONLY users SET a = 1')).toEqual(['users']);
  });
  it('rejects a table missing from the allowlist, including names the old pattern check would have accepted', () => {
    expect(validateSqlAgainstAllowlistV2('INSERT INTO fake_users_table (id) VALUES ($1)', allow)).toEqual({ ok: false, code: ERR_UNKNOWN_TABLE, reason: 'TABLE_NOT_IN_ALLOWLIST:fake_users_table' });
    expect(validateSqlAgainstAllowlistV2('INSERT INTO totally_missing_table (id) VALUES ($1)', allow)).toMatchObject({ ok: false, code: ERR_UNKNOWN_TABLE });
    expect(validateSqlAgainstAllowlistV2('SELECT id FROM users JOIN cases ON true', allow)).toEqual({ ok: true });
    expect(validateSqlAgainstAllowlistV2('SELECT 1', allow)).toEqual({ ok: true });
  });
});

describe('blocked terms (ADV004 owner)', () => {
  it('rejects placeholders and accepts clean text', () => {
    for (const t of ['x fake_email_placeholder', 'a ?? b', 'TODO fix', 'TBD', 'FIXME']) expect(validateBlockedTermsV2(t)).toMatchObject({ ok: false, code: ERR_BLOCKED_TERM });
    expect(validateBlockedTermsV2('SELECT id FROM users WHERE id = $1')).toEqual({ ok: true });
  });
});

describe('operation order (ADV005 / ADV006 owner)', () => {
  it('Postgres truth must come first', () => {
    expect(validateOperationOrderV2(['redis.set', 'postgres.write'])).toMatchObject({ ok: false, code: ERR_WRITE_ORDER_VIOLATION });
    expect(validateOperationOrderV2(['nats.publish', 'postgres.write'])).toMatchObject({ ok: false, code: ERR_EVENT_ORDER_VIOLATION });
    expect(validateOperationOrderV2(['redis.set'])).toMatchObject({ ok: false, code: ERR_WRITE_ORDER_VIOLATION });
    expect(validateOperationOrderV2(['postgres.write', 'redis.del', 'nats.publish'])).toEqual({ ok: true });
    expect(validateOperationOrderV2(['postgres.read', 'postgres.write', 'nats.publish'])).toEqual({ ok: true });
    expect(validateOperationOrderV2([])).toEqual({ ok: true });
  });
  it('the first offender decides the code', () => {
    expect(validateOperationOrderV2(['redis.set', 'nats.publish', 'postgres.write'])).toMatchObject({ code: ERR_WRITE_ORDER_VIOLATION });
    expect(validateOperationOrderV2(['nats.publish', 'redis.set', 'postgres.write'])).toMatchObject({ code: ERR_EVENT_ORDER_VIOLATION });
  });
});
