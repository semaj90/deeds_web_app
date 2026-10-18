#!/usr/bin/env npx tsx
/**
 * extract-route-ast-nodes-v2-dry-run-v1.mts  (AST-NODES-V2-01, DRY RUN)
 *
 * Extracts span-bearing, revision-qualified atlas_ast_nodes_v2 rows for ONE SvelteKit +server.ts route
 * with ast-grep's TypeScript parser (structural, not a regex scan). Prints/writes rows only; it never
 * writes to any store. Every ast-grep match is checked against the file bytes (bytes[start:end] must
 * equal the matched text) and fails closed otherwise.
 *
 *   npx tsx scripts/atlas/extract-route-ast-nodes-v2-dry-run-v1.mts src/routes/api/ace/summarize/+server.ts [--verify-db]
 *
 * --verify-db applies the v2 DRAFT DDL and inserts the rows INSIDE a transaction that is always rolled back,
 *             then proves the live database is unchanged. Without it, the database is only read (repo_id,
 *             packet diagnostics).
 * Output: .tmp/atlas/ast-nodes-v2-route-extraction-dry-run-v1.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRoot = path.join(repoRoot, 'sveltekit-frontend');
const args = process.argv.slice(2);
const verifyDb = args.includes('--verify-db');
const routeRel = (args.find((a) => !a.startsWith('--')) ?? 'src/routes/api/ace/summarize/+server.ts').replace(/\\/g, '/');
if (!/^src\/routes\/[A-Za-z0-9_.\-/()[\]+]+\/\+server\.ts$/.test(routeRel) || routeRel.includes('..')) {
  throw new Error(`REFUSING: not a frontend-relative +server.ts route path: ${routeRel}`);
}
const WORKSPACE_ID = 'repo:deeds-web-app'; // caller-supplied, not derived; workspace_revision stays NULL (not an admitted snapshot)
const HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

const exe = process.env.AST_GREP_EXE
  ?? 'C:/Users/james/AppData/Roaming/npm/node_modules/@ast-grep/cli/node_modules/@ast-grep/cli-win32-x64-msvc/ast-grep.exe';
if (!fs.existsSync(exe)) throw new Error(`ast-grep binary not found: ${exe} (set AST_GREP_EXE)`);
const versionResult = spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 30000 });
if (versionResult.error || versionResult.status !== 0) throw new Error('ast-grep version probe failed');
const version = versionResult.stdout.trim();

const abs = path.join(frontendRoot, routeRel);
const bytes = fs.readFileSync(abs);
const sourceRevision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const canonicalRepoPath = `sveltekit-frontend/${routeRel}`;

type Match = { text: string; start: number; end: number; line0: number; endLine0: number; vars: Record<string, string> };
function run(pattern: string): Match[] {
  const r = spawnSync(exe, ['run', '--lang', 'ts', '-p', pattern, '--json=compact', abs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
  if (r.error) throw new Error(`ast-grep execution failed for ${pattern}: ${r.error.message}`);
  if (r.status !== 0 && !r.stdout) throw new Error(`ast-grep failed for ${pattern}: ${r.stderr.slice(0, 200)}`);
  const raw = JSON.parse(r.stdout || '[]') as Array<any>;
  return raw.map((m) => {
    const start = m.range.byteOffset.start as number;
    const end = m.range.byteOffset.end as number;
    if (bytes.subarray(start, end).toString('utf8') !== m.text) {
      throw new Error(`FAIL_CLOSED: ast-grep span ${start}-${end} does not equal the source bytes for pattern ${pattern}`);
    }
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.metaVariables?.single ?? {})) vars[k] = (v as { text: string }).text;
    return { text: m.text, start, end, line0: m.range.start.line, endLine0: m.range.end.line, vars };
  });
}

/** Strict: throws if the byte offset cuts a multi-byte UTF-8 sequence (mirrors sidecar strict_utf8_to_utf16_offset). */
function utf16Offset(offset: number): number {
  if (offset < 0 || offset > bytes.length) throw new Error(`UTF-8 offset ${offset} out of bounds`);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)).length;
}
function treeNodeId(kind: string, symbol: string, start: number, end: number): string {
  const raw = `tn_v1|${canonicalRepoPath}|${sourceRevision}|${kind}|${symbol}|${start}:${end}`;
  return `tn_v1_${crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32)}`;
}

type Row = {
  tree_node_id: string; node_kind: string; qualified_symbol: string; start_byte: number; end_byte: number;
  start_utf16: number; end_utf16: number; line_start: number; line_end: number; parent_tree_node_id: string | null;
  structural_key: string; normalized_node_hash: string; evidence: string;
};
const rows = new Map<string, Row>();
function add(kind: string, symbol: string, m: { start: number; end: number; line0: number; endLine0: number; text: string }, evidence: string) {
  const id = treeNodeId(kind, symbol, m.start, m.end);
  rows.set(id, {
    tree_node_id: id, node_kind: kind, qualified_symbol: symbol, start_byte: m.start, end_byte: m.end,
    start_utf16: utf16Offset(m.start), end_utf16: utf16Offset(m.end), line_start: m.line0 + 1, line_end: m.endLine0 + 1,
    parent_tree_node_id: null, structural_key: `${kind}:${symbol}@${m.start}-${m.end}`,
    normalized_node_hash: crypto.createHash('sha256').update(m.text, 'utf8').digest('hex'), evidence,
  });
}

// ---- file node: the whole source -------------------------------------------------------------
const text = bytes.toString('utf8');
add('file', path.posix.basename(routeRel), { start: 0, end: bytes.length, line0: 0, endLine0: text.split('\n').length - 1, text }, 'whole-source');

// ---- route handlers (exported HTTP methods) --------------------------------------------------
for (const pattern of [
  'export const $NAME: $T = $$$V', 'export const $NAME = $$$V',
  'export async function $NAME($$$P) { $$$B }', 'export function $NAME($$$P) { $$$B }',
]) {
  for (const m of run(pattern)) if (HTTP.has(m.vars.NAME)) add('route', m.vars.NAME, m, `ast-grep:${pattern}`);
}
// ---- zod schemas -----------------------------------------------------------------------------
// The initializer may be a call chain (`z.object({...}).refine(...)`), so match any `const X = <expr>` and keep
// only expressions rooted at z.object(...) / z.strictObject(...). (A bare `z.object($$$A)` pattern misses chains.)
for (const m of run('const $NAME = $V')) {
  const v = m.vars.V ?? '';
  const root = /^z\s*\.\s*(object|strictObject)\s*\(/.exec(v); // tolerates `z\n  .object(`
  // A schema derived from an IMPORTED one (insertCaseSchema.pick({...})) is still a Zod schema use, but its base
  // identity is not resolved here; it is tagged so the gap stays visible.
  const derived = /^[A-Za-z_$][\w$]*Schema\s*\.\s*(pick|omit|extend|partial|merge)\s*\(/.exec(v);
  if (root) add('schema', m.vars.NAME, m, `ast-grep:const-init-rooted-at-z.${root[1]}`);
  else if (derived) add('schema', m.vars.NAME, m, `ast-grep:derived-from-imported-schema.${derived[1]}`);
}
// ---- auth checks -----------------------------------------------------------------------------
for (const fn of ['requireAdmin', 'requireAuth']) for (const m of run(`${fn}($$$A)`)) add('auth_guard', fn, m, `ast-grep:${fn}`);
for (const m of run('locals.user')) add('auth_guard', 'locals.user', m, 'ast-grep:locals.user');

// ---- parents by strict span containment (smallest enclosing node, else the file node) ---------
const list = [...rows.values()].sort((a, b) => a.start_byte - b.start_byte || (b.end_byte - b.start_byte) - (a.end_byte - a.start_byte) || a.tree_node_id.localeCompare(b.tree_node_id));
const fileNode = list.find((r) => r.node_kind === 'file')!;
for (const r of list) {
  if (r === fileNode) continue;
  const enclosing = list.filter((p) => p !== r && p.start_byte <= r.start_byte && p.end_byte >= r.end_byte && (p.end_byte - p.start_byte) > (r.end_byte - r.start_byte));
  enclosing.sort((a, b) => (a.end_byte - a.start_byte) - (b.end_byte - b.start_byte));
  r.parent_tree_node_id = (enclosing[0] ?? fileNode).tree_node_id;
}

// ---- JS-side validation mirroring the v2 constraints ------------------------------------------
const problems: string[] = [];
for (const r of list) {
  if (!(r.start_byte >= 0 && r.end_byte >= r.start_byte && r.end_byte <= bytes.length)) problems.push(`SPAN:${r.structural_key}`);
  if (!(r.end_utf16 >= r.start_utf16 && r.line_end >= r.line_start && r.line_start >= 1)) problems.push(`COORD:${r.structural_key}`);
  if (!/^tn_v1_[0-9a-f]{32}$/.test(r.tree_node_id)) problems.push(`ID:${r.tree_node_id}`);
  if (r.parent_tree_node_id === r.tree_node_id) problems.push(`SELF_PARENT:${r.structural_key}`);
}
if (!/^sha256:[0-9a-f]{64}$/.test(sourceRevision)) problems.push('REVISION');

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const client = await pool.connect();
  const diagnostics: string[] = [];
  let dbVerification: Record<string, unknown> | null = null;
  try {
    await client.query('BEGIN READ ONLY');
    const repos = (await client.query(`SELECT DISTINCT repo_id FROM public.atlas_ast_nodes`)).rows;
    const packets = (await client.query(
      `SELECT packet_key, source_ref FROM public.atlas_packets WHERE source_ref = ANY($1) ORDER BY packet_key`,
      [[routeRel, canonicalRepoPath]])).rows;
    await client.query('ROLLBACK');
    if (repos.length !== 1) diagnostics.push(`REPO_ID_AMBIGUOUS:${repos.length}`);
    const repoId: string | null = repos.length === 1 ? repos[0].repo_id : null;
    if (packets.length !== 1) diagnostics.push(`PACKET_KEY_LEFT_NULL:${packets.length} packets for this file across namespaces (${packets.map((p: any) => p.source_ref).join(' | ')})`);

    if (verifyDb) {
      const ddl = fs.readFileSync(path.join(frontendRoot, 'drizzle/manual/20261017_atlas_ast_nodes_v2_DRAFT.sql'), 'utf8');
      const countObjects = async () => Number((await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('atlas_ast_nodes_v2','atlas_ast_nodes_v2_current')`)).rows[0].n);
      const v1Before = Number((await pool.query(`SELECT count(*)::int AS n FROM public.atlas_ast_nodes`)).rows[0].n);
      const before = await countObjects();
      const tx = await pool.connect();
      let inserted = 0; let currentCount = 0; let error: string | null = null;
      try {
        await tx.query('BEGIN');
        await tx.query(ddl);
        await tx.query('SET CONSTRAINTS ALL IMMEDIATE');
        for (const r of list) { // parents first (sorted by start asc, size desc)
          await tx.query(
            `INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
               node_kind, qualified_symbol, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end,
               parent_tree_node_id, parser_name, parser_version, parser_language, grammar_version)
             VALUES ($1,$2,$3,'FRONTEND_ROOT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'ast-grep',$18,'typescript',$19)`,
            [r.tree_node_id, repoId, WORKSPACE_ID, routeRel, sourceRevision, bytes.length, r.node_kind, r.qualified_symbol, r.structural_key,
              r.normalized_node_hash, r.start_byte, r.end_byte, r.start_utf16, r.end_utf16, r.line_start, r.line_end, r.parent_tree_node_id,
              version, `ast-grep@${version}/builtin-typescript`]);
          inserted++;
        }
        currentCount = Number((await tx.query(`SELECT count(*)::int AS n FROM public.atlas_ast_nodes_v2_current WHERE source_revision = $1`, [sourceRevision])).rows[0].n);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        await tx.query('ROLLBACK');
        tx.release();
      }
      dbVerification = {
        mode: 'ROLLBACK_ONLY', inserted, currentViewRows: currentCount, error,
        v2ObjectsBefore: before, v2ObjectsAfter: await countObjects(), v1RowsBefore: v1Before,
        v1RowsAfter: Number((await pool.query(`SELECT count(*)::int AS n FROM public.atlas_ast_nodes`)).rows[0].n),
      };
    }
    const receipt = {
      schema: 'atlas.ast-nodes-v2-route-extraction-dry-run.v1', task: 'AST-NODES-V2-01', mode: verifyDb ? 'DRY_RUN_PLUS_ROLLBACK_ONLY_DB_VERIFY' : 'DRY_RUN',
      writesPersisted: false, canonicalAuthority: false,
      parser: { name: 'ast-grep', version, language: 'typescript', note: 'built-in TypeScript grammar; every span verified against source bytes' },
      route: { relativePath: routeRel, pathNamespace: 'FRONTEND_ROOT', canonicalRepoPath, sourceRevision, sourceByteLength: bytes.length },
      callerSupplied: { workspaceId: WORKSPACE_ID, workspaceRevision: null, repoId },
      nodeCount: list.length, byKind: Object.fromEntries([...new Set(list.map((r) => r.node_kind))].map((k) => [k, list.filter((r) => r.node_kind === k).length])),
      nodes: list, validationProblems: problems, diagnostics, dbVerification,
    };
    const receiptChecksum = crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
    const out = path.join(repoRoot, '.tmp/atlas', `ast-nodes-v2-route-extraction-dry-run-${crypto.randomUUID()}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ ...receipt, receiptChecksum }, null, 2), { flag: 'wx' });
    const { receiptChecksum: readbackChecksum, ...readbackReceipt } = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (readbackChecksum !== receiptChecksum || crypto.createHash('sha256').update(JSON.stringify(readbackReceipt)).digest('hex') !== receiptChecksum) {
      throw new Error('RECEIPT_READBACK_CHECKSUM_MISMATCH');
    }
    console.log(JSON.stringify({ route: routeRel, sourceRevision, nodeCount: list.length, byKind: receipt.byKind, validationProblems: problems, diagnostics, dbVerification, receiptChecksum, receiptReadback: 'MATCH' }, null, 2));
    for (const r of list) console.log(`${r.node_kind.padEnd(10)} ${r.qualified_symbol.padEnd(20)} bytes ${r.start_byte}-${r.end_byte} utf16 ${r.start_utf16}-${r.end_utf16} L${r.line_start}-${r.line_end} parent=${r.parent_tree_node_id?.slice(0, 14) ?? '-'}`);
    console.log(`RECEIPT ${path.relative(repoRoot, out)}`);
    process.exitCode = problems.length > 0 || (dbVerification && dbVerification.error) ? 1 : 0;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
