#!/usr/bin/env node
/**
 * Read-only preflight for the one-source canonical AST apply path.
 *
 * Opens one READ ONLY transaction, reports what exists for the exact source and declaration,
 * and writes a checksummed receipt. It never inserts, updates, or deletes.
 *
 * Usage:
 *   ATLAS_ONE_SOURCE_DATABASE_URL=... node scripts/atlas/one-source-ast-preflight-v1.mjs --plan=<write-plan.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function buildPreflightReport({ plan, sourceFileRow, chunkRowCount, astRowCount, symbolRows, sourceDigestHex }) {
  const declaration = plan.declaration ?? plan.source?.declaration ?? 'classifyErrorFixingTasks';
  const fileRowAction = !sourceFileRow
    ? 'INSERT_FILE_ROW'
    : sourceFileRow.content_hash === sourceDigestHex ? 'NO_INSERT_EXACT_MATCH' : 'CONFLICT_DIFFERENT_CONTENT';
  const symbolRowAction = symbolRows.length === 0 ? 'INSERT_SYMBOL_ROW' : 'CONFLICT_SYMBOL_ROW_EXISTS';
  const astRowAction = astRowCount === 0 ? 'INSERT_AST_NODE' : 'CONFLICT_AST_ROWS_EXIST';
  const blockers = [];
  if (fileRowAction === 'CONFLICT_DIFFERENT_CONTENT') blockers.push('FILE_ROW_CONTENT_CONFLICT');
  if (symbolRowAction !== 'INSERT_SYMBOL_ROW') blockers.push('SYMBOL_ROW_ALREADY_PRESENT');
  if (astRowAction !== 'INSERT_AST_NODE') blockers.push('AST_NODE_ALREADY_PRESENT');
  return {
    schema: 'atlas.one-source-ast-preflight.v1',
    mode: 'READ_ONLY_PREFLIGHT',
    writesPerformed: false,
    source: { sourceRef: plan.source.sourceRef, declaration, sourceRevision: plan.source.sourceRevision, workspaceRevision: plan.source.workspaceRevision },
    existing: { fileSourceRefRow: Boolean(sourceFileRow), fileRowContentHash: sourceFileRow?.content_hash ?? null, chunkSourceRefRows: chunkRowCount, astNodeRows: astRowCount, symbolSourceRefRows: symbolRows.length },
    proposed: { fileRowAction, symbolRowAction, astRowAction, insertCount: [fileRowAction, symbolRowAction, astRowAction].filter((a) => a.startsWith('INSERT')).length },
    blockers,
    readyForApply: blockers.length === 0,
  };
}

async function main() {
  const planPath = path.resolve(root, arg('--plan') ?? '');
  const planBytes = fs.readFileSync(planPath);
  const plan = JSON.parse(planBytes.toString('utf8'));
  const url = process.env.ATLAS_ONE_SOURCE_DATABASE_URL;
  if (!url) {
    console.log(JSON.stringify({ status: 'PREFLIGHT_NOT_RUN', reason: 'ATLAS_ONE_SOURCE_DATABASE_URL_REQUIRED', writesPerformed: false }, null, 2));
    process.exit(2);
  }
  const requireFromFrontend = createRequire(path.join(root, 'sveltekit-frontend/package.json'));
  const pg = requireFromFrontend('pg');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  let report;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const sourceRef = plan.source.sourceRef;
    const digestHex = plan.source.sourceRevision.replace(/^sha256:/, '');
    const file = await client.query(
      `SELECT source_ref_key, content_hash FROM atlas_source_refs WHERE repo_id = 'deeds-web-app' AND source_ref_key = $1`,
      [sourceRef],
    );
    const chunks = await client.query(`SELECT count(*)::int AS n FROM atlas_source_refs WHERE repo_id = 'deeds-web-app' AND source_ref_key LIKE $1`, [`${sourceRef}#L%`]);
    const ast = await client.query(`SELECT count(*)::int AS n FROM atlas_ast_nodes WHERE relative_path = $1`, [sourceRef]);
    const symbol = await client.query(
      `SELECT source_ref_key FROM atlas_source_refs WHERE repo_id = 'deeds-web-app' AND relative_path = $1 AND qualified_symbol = $2`,
      [sourceRef, plan.declaration ?? 'classifyErrorFixingTasks'],
    );
    await client.query('ROLLBACK');
    report = buildPreflightReport({
      plan,
      sourceFileRow: file.rows[0] ?? null,
      chunkRowCount: chunks.rows[0].n,
      astRowCount: ast.rows[0].n,
      symbolRows: symbol.rows,
      sourceDigestHex: digestHex,
    });
  } finally {
    client.release();
    await pool.end();
  }
  const outDir = path.join(root, '.tmp/atlas/canonical-ast-preflight', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(outDir, { recursive: false });
  const body = JSON.stringify({ ...report, planSha256: sha256(planBytes), generatedAt: new Date().toISOString() }, null, 1);
  fs.writeFileSync(path.join(outDir, 'preflight.json'), body, { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, 'preflight.sha256'), `${sha256(Buffer.from(body))}  preflight.json\n`, { flag: 'wx' });
  console.log(JSON.stringify({ receiptDir: path.relative(root, outDir).replaceAll('\\', '/'), readyForApply: report.readyForApply, blockers: report.blockers, proposed: report.proposed, writesPerformed: false }, null, 2));
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: 'PREFLIGHT_FAILED', error: String(err.message).slice(0, 200), writesPerformed: false }));
    process.exit(1);
  });
}
