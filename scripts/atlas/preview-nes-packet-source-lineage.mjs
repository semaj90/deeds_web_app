#!/usr/bin/env node
/** Read-only preview of NES packet source bytes for future graphify_files observations. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const ROOT = process.cwd();
const rawLimit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 128);
const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 1000 ? rawLimit : 128;
const reportPath = path.join(ROOT, 'docs/reports/nes-packet-source-lineage-preview-v1.json');
const env = { ...process.env };
for (const file of [path.join(ROOT, 'sveltekit-frontend', '.env.local'), path.join(ROOT, 'sveltekit-frontend', '.env'), path.join(ROOT, '.env')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  break;
}
const connectionString = env.DATABASE_URL ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? '123456'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const gitRevision = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
})();
function resolveSource(sourceRef) {
  const clean = String(sourceRef ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
  const relative = clean.replace(/^sveltekit-frontend\//, '');
  const candidates = [path.join(ROOT, clean), path.join(ROOT, 'sveltekit-frontend', relative)];
  const valid = [...new Set(candidates.map((candidate) => path.resolve(candidate)))].filter((candidate) => {
    const rel = path.relative(ROOT, candidate);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  });
  return valid.length === 1 ? { path: valid[0], ambiguous: false } : { path: valid[0] ?? null, ambiguous: valid.length > 1 };
}
const pool = new pg.Pool({ connectionString, max: 2 });
const report = { schema: 'atlas.nes-packet-source-lineage-preview.v1', generatedAt: new Date().toISOString(), readOnly: true, writesPerformed: false, limit, workspaceRevision: gitRevision, classifications: {}, records: [] };
try {
  const { rows } = await pool.query(`SELECT packet_key, source_ref, feature_id FROM public.nes_chrom_packets WHERE source_ref IS NOT NULL ORDER BY source_ref, packet_key LIMIT $1`, [limit]);
  for (const row of rows) {
    const resolved = resolveSource(row.source_ref);
    let contentHash = null;
    if (resolved.path && !resolved.ambiguous) contentHash = sha256(fs.readFileSync(resolved.path));
    const classification = resolved.ambiguous ? 'AMBIGUOUS_SOURCE_PATH' : !resolved.path ? 'MISSING_SOURCE' : 'EXACT_FILE_BYTES_CANDIDATE';
    report.classifications[classification] = (report.classifications[classification] ?? 0) + 1;
    report.records.push({ packetKey: row.packet_key, sourceRef: row.source_ref, featureId: row.feature_id, sourcePath: resolved.path ? path.relative(ROOT, resolved.path).replaceAll('\\', '/') : null, contentHash, sourceRevision: contentHash ? `sha256:${contentHash}` : null, workspaceRevision: gitRevision, classification });
  }
  report.status = 'COMPLETE_READ_ONLY';
} catch (error) {
  report.status = 'ERROR';
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await pool.end();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, classifications: report.classifications, sampleCount: report.records.length, reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
}
