#!/usr/bin/env node

/** Read-only packet source-scope census for the per-folder operator decision. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const ROOT = process.cwd();
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const lineagePath = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const outputPath = path.join(ROOT, 'docs/reports/packet-source-scope-v1.json');
const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
const workspaceRevision = lineage.workspaceRevision;
const normalize = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rel = (filePath) => path.relative(ROOT, filePath).replaceAll('\\', '/');

function folderKey(sourceRef) {
  const value = normalize(sourceRef);
  if (/^[A-Za-z]:\//.test(value)) return '<ABSOLUTE_EXTERNAL_REFERENCE>';
  const parts = value.split('/').filter(Boolean);
  if (parts[0] === 'sveltekit-frontend' && parts[1]) return `sveltekit-frontend/${parts[1]}`;
  return parts[0] || '<EMPTY_SOURCE_REF>';
}

function recommendation(folder) {
  const lower = folder.toLowerCase();
  if (folder === '<ABSOLUTE_EXTERNAL_REFERENCE>') return 'EXTERNAL_REFERENCE_REVIEW';
  if (['.python311', '.venv_turbovec', '.tmp', 'logs', 'scratch', 'backup', 'backups', 'node_modules'].some((x) => lower === x || lower.includes(x))) return 'EXCLUDE_NON_SOURCE_REVIEW';
  if (['llama-cpp-turboquant-gemma4', 'turbovec', 'crates', 'simd-bridge', 'neschrom97'].some((x) => lower.startsWith(x))) return 'REVIEW_VENDOR_OR_PROJECTION';
  if (folder === 'sveltekit-frontend/src' || folder === 'packages' || folder === 'scripts' || folder === 'sveltekit-frontend/scripts') return 'KEEP_IF_SOURCE_QUALIFIED';
  return 'REVIEW_TOP_LEVEL';
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  const packets = (await client.query('SELECT source_ref, source_revision, workspace_revision, workspace_id FROM atlas_packets ORDER BY source_ref')).rows;
  const bindings = new Set((await client.query('SELECT canonical_source_ref FROM atlas_workspace_source_bindings WHERE workspace_revision = $1', [workspaceRevision])).rows.map((row) => normalize(row.canonical_source_ref)));
  const groups = new Map();
  for (const packet of packets) {
    const sourceRef = normalize(packet.source_ref);
    const folder = folderKey(sourceRef);
    const current = groups.get(folder) ?? {
      folder,
      packetCount: 0,
      sourceRevisionPopulated: 0,
      exactAdmittedBindingMatches: 0,
      legacyWorkspaceRevisionZero: 0,
      sampleSourceRefs: [],
      recommendation: recommendation(folder),
      operatorDisposition: null,
    };
    current.packetCount += 1;
    if (packet.source_revision) current.sourceRevisionPopulated += 1;
    if (String(packet.workspace_revision ?? '') === '0') current.legacyWorkspaceRevisionZero += 1;
    if (bindings.has(sourceRef)) current.exactAdmittedBindingMatches += 1;
    if (current.sampleSourceRefs.length < 5 && sourceRef) current.sampleSourceRefs.push(sourceRef);
    groups.set(folder, current);
  }
  const rows = [...groups.values()].sort((a, b) => b.packetCount - a.packetCount || a.folder.localeCompare(b.folder));
  const receipt = {
    schema: 'atlas.packet-source-scope.v1',
    generatedAt: new Date().toISOString(),
    gate: 'CURRENT_SOURCE_PACKET_SCOPE_DECISION',
    input: {
      workspaceRevision,
      packetRows: packets.length,
      admittedBindingRows: bindings.size,
      sourceSnapshot: rel(lineagePath),
      sourceAuthorityStatus: lineage.status ?? 'UNKNOWN',
    },
    rows,
    policy: {
      operatorDispositionRequired: true,
      allowedDispositions: ['KEEP_CANONICAL', 'EXCLUDE_NON_SOURCE', 'EXTERNAL_REFERENCE', 'REVIEW_REQUIRED'],
      noAutomaticFolderPromotion: true,
      archiveNeverDelete: true,
      packetWritesPerformed: false,
    },
    totals: {
      packetRows: packets.length,
      sourceRevisionPopulated: packets.filter((row) => row.source_revision).length,
      exactAdmittedBindingMatches: packets.filter((row) => bindings.has(normalize(row.source_ref))).length,
      legacyWorkspaceRevisionZero: packets.filter((row) => String(row.workspace_revision ?? '') === '0').length,
    },
    status: 'OPERATOR_FOLDER_DISPOSITION_REQUIRED',
    canonicalAuthority: false,
    writesPerformed: false,
  };
  receipt.checksum = `sha256:${sha256(JSON.stringify({ ...receipt, generatedAt: undefined, checksum: undefined }))}`;
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath: outputPath, status: receipt.status, folderCount: rows.length, totals: receipt.totals, writesPerformed: false }, null, 2));
} finally {
  client.release();
  await pool.end();
}
