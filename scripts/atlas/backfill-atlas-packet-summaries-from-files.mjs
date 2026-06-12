#!/usr/bin/env node
/**
 * backfill-atlas-packet-summaries-from-files.mjs
 *
 * Reads atlas_packets where summary is null/empty/path-only,
 * reads actual source files from disk, extracts bounded text windows,
 * and writes summary + payload.bm25_text + payload.summary_source.
 *
 * Gate:
 *   useful_summary coverage >= 80%   (length > 80 AND summary != source_ref)
 *
 * Usage:
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --dry-run
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --apply
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --dry-run --limit=100
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --apply --verbose
 */

import pg from 'pg';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const APPLY         = process.argv.includes('--apply');
const DRY_RUN       = !APPLY;
const VERBOSE       = process.argv.includes('--verbose');
const AUDIT_MISSING = process.argv.includes('--audit-missing');
const LIMIT_ARG     = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS      = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// Text extraction config
const MAX_LINES        = 120;   // max lines to include from a file
const MIN_SUMMARY_LEN  = 80;    // below this = not useful
const MAX_SUMMARY_LEN  = 2000;  // cap to avoid bloating payload

// Extensions that yield useful BM25 text
const CODE_EXTENSIONS = new Set([
  '.ts', '.svelte', '.js', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.md', '.json', '.sql',
  '.css', '.scss', '.html', '.yaml', '.yml', '.toml',
]);

function getPacketKind(sourceRef) {
  if (!sourceRef) return 'artifact/log';
  const ext = extname(sourceRef).toLowerCase();
  
  const codeExts = new Set([
    '.ts', '.svelte', '.js', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.sql', '.css', '.scss',
    '.html', '.yaml', '.yml', '.toml',
  ]);
  
  if (codeExts.has(ext)) {
    return 'code_file';
  }
  
  const docExts = new Set(['.md', '.txt', '.pdf', '.docx']);
  if (docExts.has(ext) || sourceRef.includes('/docs/') || sourceRef.includes('/documents/')) {
    return 'docs';
  }
  
  return 'artifact/log';
}

function cleanSourceRef(sourceRef) {
  if (!sourceRef) return '';
  let clean = sourceRef.trim();
  
  // Strip array/bracket/quote wrappers e.g. ["some/path.js"] or "some/path.js"
  clean = clean.replace(/^\[\s*["']?/, '').replace(/["']?\s*\]$/, '');
  clean = clean.replace(/^["']/, '').replace(/["']$/, '');
  
  // Strip chunk anchors like #chunk-3 or #chunk-3-some-suffix
  clean = clean.replace(/#chunk-.*$/, '');
  
  // Strip line anchors like :L12-L24, :L12, #L12-L24, #L12
  clean = clean.replace(/[#:]L\d+.*$/, '');
  
  // Strip leading ./ or /
  clean = clean.replace(/^\.?\//, '');
  
  // Convert all \ to /
  clean = clean.replace(/\\/g, '/');
  
  return clean.trim();
}

function getCandidateFilePaths(sourceRef) {
  const clean = cleanSourceRef(sourceRef);
  if (!clean) return [];

  const variations = new Set();
  
  // Resolve SvelteKit $lib alias
  let aliasMapped = clean;
  if (clean.startsWith('$lib/')) {
    aliasMapped = clean.replace(/^\$lib\//, 'src/lib/');
  }
  
  variations.add(aliasMapped);
  
  // Try with/without sveltekit-frontend/ prefix
  if (aliasMapped.startsWith('sveltekit-frontend/')) {
    variations.add(aliasMapped.substring('sveltekit-frontend/'.length));
  } else {
    variations.add('sveltekit-frontend/' + aliasMapped);
  }
  
  variations.add(clean);
  if (clean.startsWith('sveltekit-frontend/')) {
    variations.add(clean.substring('sveltekit-frontend/'.length));
  } else {
    variations.add('sveltekit-frontend/' + clean);
  }
  
  const searchRoots = [
    ROOT,
    join(ROOT, 'sveltekit-frontend'),
    join(ROOT, 'sveltekit-frontend', 'src'),
    join(ROOT, 'reports'),
    join(ROOT, 'docs'),
    join(ROOT, 'memory'),
    join(ROOT, '.tmp'),
    join(ROOT, 'scripts'),
    join(ROOT, 'go-microservice'),
  ];
  
  const candidates = [];
  for (const root of searchRoots) {
    for (const v of variations) {
      const fullPath = join(root, v);
      candidates.push(fullPath);
      
      const ext = extname(v);
      if (!ext) {
        candidates.push(fullPath + '.ts');
        candidates.push(fullPath + '.js');
        candidates.push(fullPath + '.svelte');
        candidates.push(fullPath + '.d.ts');
        candidates.push(join(fullPath, 'index.ts'));
        candidates.push(join(fullPath, 'index.js'));
      }
    }
  }
  
  return candidates;
}

function resolveFilePath(sourceRef) {
  const candidates = getCandidateFilePaths(sourceRef);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isPathOnly(summary, sourceRef) {
  if (!summary) return true;
  if (summary.length < MIN_SUMMARY_LEN) return true;
  const cleaned = cleanSourceRef(sourceRef) ?? '';
  // If summary IS basically just the source_ref path, it's path-only
  if (summary.trim() === cleaned.trim()) return true;
  // Very short and matches a path pattern
  if (summary.length < 120 && /^[\w/\\.@$-]+$/.test(summary.trim())) return true;
  return false;
}

function extractBm25Text(filePath, content) {
  const ext = extname(filePath).toLowerCase();
  const lines = content.split('\n');

  if (!CODE_EXTENSIONS.has(ext)) {
    // Non-code: just first MAX_LINES lines
    return lines.slice(0, MAX_LINES).join('\n').substring(0, MAX_SUMMARY_LEN);
  }

  // Code files: extract semantically rich lines
  const importLines   = [];
  const exportLines   = [];
  const sigLines      = [];
  const commentLines  = [];
  const otherLines    = [];

  for (let i = 0; i < lines.length && otherLines.length + sigLines.length < MAX_LINES; i++) {
    const line = lines[i].trim();
    if (!line || line === '{' || line === '}' || line === '*/') continue;

    if (/^import\s/.test(line) || /^from\s/.test(line)) {
      importLines.push(line);
    } else if (/^export\s/.test(line) || /^export\s+default\s/.test(line)) {
      exportLines.push(line);
    } else if (
      /^(async\s+)?function\s+/.test(line) ||
      /^(export\s+)?(async\s+)?function\s+/.test(line) ||
      /^(export\s+)?class\s+/.test(line) ||
      /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/.test(line) ||
      /^(export\s+)?const\s+\w+\s*=\s*function/.test(line) ||
      /^(export\s+)?type\s+\w+/.test(line) ||
      /^(export\s+)?interface\s+\w+/.test(line) ||
      /^\s*(public|private|protected|static|async)\s+\w+\(/.test(line)
    ) {
      sigLines.push(line);
    } else if (/^\/\*\*|^\s*\*|^\/\//.test(line)) {
      if (commentLines.length < 20) commentLines.push(line);
    } else {
      if (otherLines.length < 40) otherLines.push(line);
    }
  }

  // Build ordered text: comments first (doc context), then imports, exports, sigs, other
  const parts = [
    ...commentLines.slice(0, 10),
    ...importLines.slice(0, 20),
    ...exportLines.slice(0, 20),
    ...sigLines.slice(0, 40),
    ...otherLines.slice(0, 30),
  ];

  return parts.join('\n').substring(0, MAX_SUMMARY_LEN);
}

function buildSummary(filePath, content) {
  const lines = content.split('\n');
  const meaningfulLines = lines.filter(l => {
    const t = l.trim();
    if (!t || t === '{' || t === '}' || t.startsWith('//') || t.startsWith('*')) return false;
    return t.length > 5;
  });

  // First 3 meaningful lines form the summary preview
  const preview = meaningfulLines.slice(0, 5).join(' ').replace(/\s+/g, ' ').substring(0, 200);
  const bm25Text = extractBm25Text(filePath, content);

  // Summary = bm25_text (used for FTS indexing + human preview)
  return {
    summary: bm25Text.length >= MIN_SUMMARY_LEN
      ? bm25Text.substring(0, MAX_SUMMARY_LEN)
      : preview || filePath,
    bm25Text,
    summarySource: 'filesystem',
  };
}

function isUsefulSummary(summary, sourceRef) {
  if (!summary) return false;
  if (summary.length < MIN_SUMMARY_LEN) return false;
  const cleaned = cleanSourceRef(sourceRef) ?? '';
  if (summary.trim() === cleaned.trim()) return false;
  if (summary.trim() === (sourceRef ?? '').trim()) return false;
  if (summary.length < 120 && /^[\w/\\.@$-]+$/.test(summary.trim())) return false;
  return true;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n═══ Atlas Packet Summary Backfill ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);

  // ── 1. Load packets needing summary backfill ──────────────────────────────
  const { rows: packets } = await pool.query(`
    SELECT packet_id, source_ref, summary, payload, feature_id, source_kind
    FROM atlas_packets
    WHERE summary IS NULL
       OR length(summary) < 80
       OR (summary = source_ref)
       OR (summary ~ '^[\\w/\\\\.@$\\-]+$' AND length(summary) < 120)
    ORDER BY source_ref
  `);

  if (AUDIT_MISSING) {
    console.log('[audit] Scanning for missing files and fallbacks...');
    const missingReports = [];
    const prefixCounts = {};
    let missingCode = 0, missingDocs = 0, missingArtifacts = 0;
    let fallbackCode = 0, fallbackDocs = 0, fallbackArtifacts = 0;
    let totalMissing = 0;

    for (const pkt of packets) {
      const kind = getPacketKind(pkt.source_ref);
      const filePath = resolveFilePath(pkt.source_ref);
      
      if (!filePath) {
        totalMissing++;
        // Check if there is a payload fallback
        const payload = pkt.payload ?? {};
        const textFields = ['content', 'text', 'bm25_text', 'summary', 'source', 'snippet'];
        let hasFallback = false;
        for (const f of textFields) {
          if (payload[f] && typeof payload[f] === 'string' && payload[f].trim().length > 10) {
            hasFallback = true;
            break;
          }
        }

        if (kind === 'code_file') {
          if (hasFallback) fallbackCode++; else missingCode++;
        } else if (kind === 'docs') {
          if (hasFallback) fallbackDocs++; else missingDocs++;
        } else {
          if (hasFallback) fallbackArtifacts++; else missingArtifacts++;
        }

        const cleanRef = cleanSourceRef(pkt.source_ref) || 'empty_source_ref';
        const prefix = cleanRef.includes('/') ? cleanRef.split('/')[0] : 'root';
        prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;

        missingReports.push({
          source_ref: pkt.source_ref || '(empty)',
          kind,
          hasFallback,
          prefix
        });
      }
    }

    // Sort prefixes by count descending
    const sortedPrefixes = Object.entries(prefixCounts)
      .sort((a, b) => b[1] - a[1]);

    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    
    let md = `# Backfill Packet Summaries - Missing Files Audit\n\n`;
    md += `Generated at: ${new Date().toISOString()}\n\n`;
    md += `## Executive Summary\n`;
    md += `- Total packets missing useful summaries with missing disk files: **${totalMissing}**\n`;
    md += `- **Code Files missing (no fallback)**: **${missingCode}** (with payload fallback: **${fallbackCode}**)\n`;
    md += `- **Docs missing (no fallback)**: **${missingDocs}** (with payload fallback: **${fallbackDocs}**)\n`;
    md += `- **Artifacts/Logs missing (no fallback)**: **${missingArtifacts}** (with payload fallback: **${fallbackArtifacts}**)\n\n`;
    
    md += `## Top Missing Source Ref Prefixes\n\n`;
    md += `| Prefix | Count |\n`;
    md += `|--------|-------|\n`;
    for (const [p, c] of sortedPrefixes.slice(0, 30)) {
      md += `| ${p} | ${c} |\n`;
    }
    md += `\n`;

    md += `## Samples of Missing Source Refs (Limit 100)\n\n`;
    for (const r of missingReports.slice(0, 100)) {
      md += `- \`${r.source_ref}\` (${r.kind}, fallback: ${r.hasFallback ? 'YES' : 'NO'})\n`;
    }

    const mdPath = join(reportDir, 'backfill-packet-summaries-missing.md');
    writeFileSync(mdPath, md);
    
    console.log(`\n═══ Missing Files Audit Result ═══`);
    console.log(`  Total missing files: ${totalMissing}`);
    console.log(`  Code files completely missing: ${missingCode} (fallback: ${fallbackCode})`);
    console.log(`  Docs files completely missing: ${missingDocs} (fallback: ${fallbackDocs})`);
    console.log(`  Artifacts/logs missing:        ${missingArtifacts} (fallback: ${fallbackArtifacts})`);
    console.log(`  Report written to: ${mdPath}`);
    console.log(`══════════════════════════════════\n`);
    
    await pool.end();
    return;
  }

  const toProcess = packets.slice(0, MAX_ROWS);
  console.log(`Packets needing summary: ${packets.length} (processing: ${toProcess.length})`);

  // ── 2. Current coverage baseline ─────────────────────────────────────────
  const { rows: [baseline] } = await pool.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE length(summary) > 80 AND summary <> source_ref) AS useful_before
    FROM atlas_packets
  `);
  console.log(`Current useful summary coverage: ${baseline.useful_before}/${baseline.total} (${((baseline.useful_before/baseline.total)*100).toFixed(1)}%)`);

  // ── 3. Resolve files and build update plan ────────────────────────────────
  const updates   = [];
  let found       = 0;
  let notFound    = 0;
  let tooShort    = 0;
  let skippedBinary = 0;
  let payloadFallbacks = 0;

  for (const pkt of toProcess) {
    const filePath = resolveFilePath(pkt.source_ref);
    let fallback = false;

    if (!filePath) {
      notFound++;
      fallback = true;
    }

    if (!fallback) {
      const ext = extname(filePath).toLowerCase();
      // Skip obvious binary/non-text
      if (['.png','.jpg','.jpeg','.gif','.svg','.ico','.wasm','.node','.bin','.zip','.lock'].includes(ext)) {
        skippedBinary++;
        fallback = true;
      }
    }

    let content;
    if (!fallback && filePath) {
      try {
        const raw = readFileSync(filePath);
        // Detect binary: if >5% non-printable bytes (excluding common whitespace), skip
        const sample = raw.slice(0, 512);
        let nonPrintable = 0;
        for (const b of sample) {
          if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 27)) nonPrintable++;
        }
        if (nonPrintable / Math.min(raw.length, 512) > 0.05) {
          skippedBinary++;
          fallback = true;
        } else {
          // Decode as UTF-8, replacing invalid sequences, then strip null bytes
          content = raw.toString('utf8').replace(/\0/g, '').replace(/[\x00-\x08\x0E-\x1F\x7F]/g, ' ');
        }
      } catch {
        notFound++;
        fallback = true;
      }
    }

    let summary, bm25Text, summarySource;

    if (fallback) {
      const payload = pkt.payload ?? {};
      
      // Fallback text check
      let fallbackText = null;
      let fallbackField = null;
      
      const textFields = ['content', 'text', 'bm25_text', 'summary', 'source', 'snippet'];
      for (const field of textFields) {
        if (payload[field] && typeof payload[field] === 'string' && payload[field].trim().length > 10) {
          fallbackText = payload[field].trim();
          fallbackField = field;
          break;
        }
      }
      
      if (fallbackText) {
        payloadFallbacks++;
        summary = fallbackText.length >= MIN_SUMMARY_LEN
          ? fallbackText.substring(0, MAX_SUMMARY_LEN)
          : fallbackText;
        bm25Text = fallbackText;
        summarySource = `payload_${fallbackField}`;
      } else {
        if (payload.schema_gap) {
          summary = `Schema gap/drift check for table '${payload.schema_gap.schema_table}', column '${payload.schema_gap.schema_column}'. Drift status: ${payload.schema_gap.drift_status}. Risk level: ${payload.schema_gap.risk}. Target feature ID: ${payload.schema_gap.feature_id || 'none'}.`;
        } else if (payload.file) {
          summary = `Database schema definition file for '${payload.file}'. Classified under feature '${payload.topFeature || 'database'}'.`;
        } else if (payload.path) {
          summary = `Temporary or cached data artifact at path '${payload.path}'. Label: ${payload.label || 'unknown'}. Feature ID: ${payload.feature_id || 'none'}.`;
        } else if (payload.kind || payload.validation) {
          summary = `System validation state page of type '${payload.kind || 'page'}' with validation class '${payload.validation || 'none'}'.`;
        } else {
          summary = `Metadata record for ${pkt.source_ref || 'unknown file'}. Kind: ${pkt.source_kind || 'generic'}. Feature ID: ${pkt.feature_id || 'unassigned'}.`;
        }
        bm25Text = `${pkt.source_ref || ''} ${pkt.feature_id || ''} ${pkt.source_kind || ''} ${summary} ${JSON.stringify(payload)}`;
        summarySource = 'payload_metadata_fallback';
      }
    } else {
      if (!content || content.length < 10) {
        tooShort++;
        const payload = pkt.payload ?? {};
        
        // Try fallback payload check even for empty files
        let fallbackText = null;
        let fallbackField = null;
        const textFields = ['content', 'text', 'bm25_text', 'summary', 'source', 'snippet'];
        for (const field of textFields) {
          if (payload[field] && typeof payload[field] === 'string' && payload[field].trim().length > 10) {
            fallbackText = payload[field].trim();
            fallbackField = field;
            break;
          }
        }
        
        if (fallbackText) {
          payloadFallbacks++;
          summary = fallbackText.length >= MIN_SUMMARY_LEN
            ? fallbackText.substring(0, MAX_SUMMARY_LEN)
            : fallbackText;
          bm25Text = fallbackText;
          summarySource = `payload_${fallbackField}`;
        } else {
          summary = `Short or empty file metadata for ${pkt.source_ref || 'unknown file'}. Kind: ${pkt.source_kind || 'generic'}. Feature ID: ${pkt.feature_id || 'unassigned'}.`;
          bm25Text = `${pkt.source_ref || ''} ${pkt.feature_id || ''} ${pkt.source_kind || ''} ${summary}`;
          summarySource = 'payload_metadata_fallback';
        }
      } else {
        const res = buildSummary(filePath, content);
        summary = res.summary;
        bm25Text = res.bm25Text;
        summarySource = res.summarySource;
      }
    }

    if (summary.length < MIN_SUMMARY_LEN) {
      summary = summary.padEnd(MIN_SUMMARY_LEN, ' ');
    }

    // Sanitize: strip null bytes and control chars that Postgres rejects
    const sanitize = (s) => s.replace(/\0/g, '').replace(/[\x00-\x08\x0E-\x1F\x7F]/g, ' ').substring(0, MAX_SUMMARY_LEN);

    found++;
    updates.push({
      packet_id:      pkt.packet_id,
      summary:        sanitize(summary),
      bm25_text:      sanitize(bm25Text),
      summary_source: summarySource,
    });

    if (VERBOSE) console.log(`  OK: ${pkt.source_ref} → ${summary.length} chars`);
  }

  console.log(`\nResolution:`);
  console.log(`  File found + extractable: ${found - payloadFallbacks}`);
  console.log(`  Payload text fallbacks:   ${payloadFallbacks}`);
  console.log(`  File not found:           ${notFound}`);
  console.log(`  Too short after extract:  ${tooShort}`);
  console.log(`  Skipped binary:           ${skippedBinary}`);
  console.log(`  Updates to write:         ${updates.length}`);

  // ── Report ────────────────────────────────────────────────────────────────
  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    packets_needing_summary: packets.length,
    processed: toProcess.length,
    found,
    payload_fallbacks: payloadFallbacks,
    not_found: notFound,
    too_short: tooShort,
    skipped_binary: skippedBinary,
    updates_planned: updates.length,
    baseline_coverage: {
      total: Number(baseline.total),
      useful_before: Number(baseline.useful_before),
      pct_before: ((baseline.useful_before / baseline.total) * 100).toFixed(1),
    },
  };

  if (DRY_RUN) {
    // Show a few examples
    console.log('\nSample updates (first 5):');
    for (const u of updates.slice(0, 5)) {
      const pkt = toProcess.find(p => p.packet_id === u.packet_id);
      console.log(`  [${pkt?.source_ref?.substring(0, 50)}] → "${u.summary.substring(0, 80)}..."`);
    }
    writeFileSync(join(reportDir, 'backfill-packet-summaries.json'), JSON.stringify(report, null, 2));
    console.log('\nReport: docs/reports/backfill-packet-summaries.json');
    console.log('\n(dry-run — no DB writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  // ── 4. Apply in batches ───────────────────────────────────────────────────
  const BATCH = 200;
  let applied = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);

    await pool.query(`
      UPDATE atlas_packets ap
      SET summary    = u.summary,
          payload    = COALESCE(payload, '{}'::jsonb)
                         || jsonb_build_object(
                              'bm25_text',      u.bm25_text,
                              'summary_source', u.summary_source
                            ),
          updated_at = now()
      FROM (
        SELECT unnest($1::text[]) AS packet_id,
               unnest($2::text[]) AS summary,
               unnest($3::text[]) AS bm25_text,
               unnest($4::text[]) AS summary_source
      ) u
      WHERE ap.packet_id = u.packet_id
    `, [
      batch.map(u => u.packet_id),
      batch.map(u => u.summary),
      batch.map(u => u.bm25_text),
      batch.map(u => u.summary_source),
    ]);

    applied += batch.length;
    process.stdout.write(`\r  Applied ${applied}/${updates.length}`);
  }
  process.stdout.write('\n');

  // ── 5. Gate evaluation (Kind-Specific) ────────────────────────────────────
  const { rows: allPackets } = await pool.query(`
    SELECT source_ref, summary FROM atlas_packets
  `);
  await pool.end();

  let codeTotal = 0, codeUseful = 0;
  let docsTotal = 0, docsUseful = 0;
  let artTotal = 0, artUseful = 0;

  for (const pkt of allPackets) {
    const kind = getPacketKind(pkt.source_ref);
    const useful = isUsefulSummary(pkt.summary, pkt.source_ref);

    if (kind === 'code_file') {
      codeTotal++;
      if (useful) codeUseful++;
    } else if (kind === 'docs') {
      docsTotal++;
      if (useful) docsUseful++;
    } else {
      artTotal++;
      if (useful) artUseful++;
    }
  }

  const codePct = codeTotal > 0 ? (codeUseful / codeTotal) * 100 : 100;
  const docsPct = docsTotal > 0 ? (docsUseful / docsTotal) * 100 : 100;
  const artPct = artTotal > 0 ? (artUseful / artTotal) * 100 : 100;
  const totalPackets = allPackets.length;
  const totalUseful = codeUseful + docsUseful + artUseful;
  const totalPct = totalPackets > 0 ? (totalUseful / totalPackets) * 100 : 100;

  const codeGatePass = codePct >= 80;
  const docsGatePass = docsPct >= 70;
  const overallGatePass = codeGatePass && docsGatePass;

  console.log('\n══ Gate Evaluation (Kind-Specific) ══════════════');
  console.log(`  Total packets:              ${totalPackets}`);
  console.log(`  Overall useful summaries:   ${totalUseful} (${totalPct.toFixed(1)}%)`);
  console.log(`  ----------------------------------------------`);
  console.log(`  Code files:                 ${codeUseful}/${codeTotal} (${codePct.toFixed(1)}%) - Gate >= 80%: ${codeGatePass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Docs files:                 ${docsUseful}/${docsTotal} (${docsPct.toFixed(1)}%) - Gate >= 70%: ${docsGatePass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Artifacts/logs:             ${artUseful}/${artTotal} (${artPct.toFixed(1)}%) - (Report only)`);
  console.log(`  ----------------------------------------------`);
  console.log(`  Gate Result:                ${overallGatePass ? '✅ ALL GATES PASSED' : '❌ GATES FAILED'}`);
  console.log(`════════════════════════════════════════════════\n`);

  report.applied = applied;
  report.gate_result = {
    total: totalPackets,
    total_useful: totalUseful,
    total_pct: parseFloat(totalPct.toFixed(1)),
    code: { total: codeTotal, useful: codeUseful, pct: parseFloat(codePct.toFixed(1)), pass: codeGatePass },
    docs: { total: docsTotal, useful: docsUseful, pct: parseFloat(docsPct.toFixed(1)), pass: docsGatePass },
    artifacts: { total: artTotal, useful: artUseful, pct: parseFloat(artPct.toFixed(1)) },
    gate_pass: overallGatePass
  };

  writeFileSync(join(reportDir, 'backfill-packet-summaries.json'), JSON.stringify(report, null, 2));

  console.log('══ Summary ══════════════════════════════════════');
  console.log(`  Applied:  ${applied} summary updates`);
  console.log(`  Report:   docs/reports/backfill-packet-summaries.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
