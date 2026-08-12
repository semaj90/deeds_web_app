#!/usr/bin/env node
/**
 * research-error-fixes.mjs
 *
 * ER0-ER6 first slice: fingerprint unresolved errors, dedupe, hydrate local
 * ACE context, classify whether external research is actually needed, and
 * only then escalate to LDR (Firecrawl-backed). Persists a research receipt.
 *
 * Contract (read-only w.r.t. source, enforced by never touching it):
 *   READ error_logs, READ ACE codebase context, OPTIONALLY CALL LDR,
 *   WRITE error_research_context receipts.
 *   NEVER patch source. NEVER change graph identity. NEVER mark error resolved.
 * Fix generation/application (ER7+) is explicitly out of scope here.
 *
 * Flow per unresolved error:
 *   1. Compute error_fingerprint (category + normalized message + source_ref,
 *      NOT timestamps/line numbers/request IDs) — dedupes N identical
 *      failures into one research population.
 *   2. Skip if (fingerprint, workspace_revision, policy_revision) already has
 *      a receipt — no repeat local/LDR work for an already-researched error.
 *   3. Hydrate LOCAL context first via fetchCodebaseContext (the real ACE
 *      entry point in features/ai/ace/context-assembler.ts).
 *   4. Classify disposition: LOCAL_CONTEXT_SUFFICIENT (known, structural,
 *      locally-fixable category) vs EXTERNAL_RESEARCH_REQUIRED (unrecognized
 *      category — plausibly a library/framework/runtime issue).
 *   5. Only for EXTERNAL_RESEARCH_REQUIRED: build a grounded research
 *      question FROM the local ACE context (not just the raw error string),
 *      then call runLocalDeepResearch (LDR/Firecrawl).
 *   6. Persist the receipt either way.
 *
 * MUST run from sveltekit-frontend/ so $lib aliases resolve (see CLAUDE.md
 * "NPX Execution Context & Module Alias Resolution"). Usage:
 *   cd sveltekit-frontend
 *   npx tsx ../scripts/atlas/research-error-fixes.mjs --limit=10 [--apply] [--category=type_mismatch]
 *
 * Dry-run by default — prints what would be fingerprinted/classified/
 * researched. --apply runs ACE + (conditionally) LDR and writes receipts.
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

function loadAtlasEnv(root) {
  const envFile = path.join(root, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const [key, val] = line.split('=');
      if (key && val && !key.startsWith('#') && !process.env[key.trim()]) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
  return { loadedFiles: [envFile] };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadAtlasEnv(path.resolve(__dirname, '../..'));

const POLICY_REVISION = 'research-error-fixes-v1';
const MAX_EXTERNAL_RESEARCH_PER_RUN = 25;

// Categories plan-error-fixes.mjs already classifies as structural/local
// (ast_fixer, schema_migration, zod_validator, etc.) never need external
// research — they're fixed by reading the local code, not by looking up
// library/framework behavior. Anything NOT in this list is conservatively
// treated as possibly needing external research (unknown category = unknown
// cause, per the examples in review: upstream library behavior, framework
// migrations, vendor-specific issues).
const LOCAL_SUFFICIENT_CATEGORIES = new Set([
  'inference_error',
  'type_mismatch',
  'missing_field',
  'orphaned_reference',
  'validation_error',
]);

function log(msg, level = 'info') {
  const ts = new Date().toISOString();
  const prefix = { info: '✓', warn: '⚠', error: '✗', plan: '📋' }[level] || '•';
  console.log(`[${ts}] ${prefix} ${msg}`);
}

function parseArgs(argv) {
  const limit = parseInt(argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '10', 10);
  const apply = argv.includes('--apply');
  const category = argv.find((a) => a.startsWith('--category='))?.split('=')[1] ?? null;
  return { limit: Math.max(1, Math.min(limit, 100)), apply, category };
}

function normalizeMessage(message) {
  return String(message ?? '')
    .replace(/\b\d+\b/g, 'N') // strip line numbers / counts / IDs
    .replace(/0x[0-9a-f]+/gi, '0xHEX')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function computeFingerprint(row) {
  const basis = [row.error_category ?? '', normalizeMessage(row.message), row.source_ref ?? row.file_path ?? ''].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function classifyDisposition(category) {
  return LOCAL_SUFFICIENT_CATEGORIES.has(category) ? 'LOCAL_CONTEXT_SUFFICIENT' : 'EXTERNAL_RESEARCH_REQUIRED';
}

function buildGroundedResearchQuery(row, codebaseContext) {
  const base = `${row.error_category ?? 'error'}: ${normalizeMessage(row.message)}`;
  const locality = row.file_path ? ` (observed in ${row.file_path})` : '';
  // Ground the question in what local ACE context actually found, when
  // available, instead of asking LDR to research the raw compiler string.
  const summary =
    codebaseContext && typeof codebaseContext === 'object'
      ? JSON.stringify(codebaseContext).slice(0, 300)
      : null;
  const grounding = summary ? ` Local context: ${summary}` : '';
  return `${base}${locality}.${grounding}`.slice(0, 600);
}

async function main() {
  const { limit, apply, category } = parseArgs(process.argv.slice(2));

  log('═══════════════════════════════════════════════════════════════', 'plan');
  log('   RESEARCH ERROR FIXES — fingerprint → ACE → LDR escalation (ER0-ER6)', 'plan');
  log(`   mode: ${apply ? 'APPLY' : 'DRY-RUN (no calls, no writes)'}`, 'plan');
  log('═══════════════════════════════════════════════════════════════\n', 'plan');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log('DATABASE_URL env var not set', 'error');
    process.exit(1);
  }

  const workspaceRevision = process.env.WORKSPACE_REVISION ?? 'unknown';
  const pool = new pg.Pool({ connectionString });

  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_name = 'error_logs' AND table_schema = 'public')
    `);
    if (!tableCheck.rows[0].exists) {
      log('error_logs table does not exist', 'error');
      process.exit(1);
    }

    const linkTableExists = (
      await pool.query(`
        SELECT EXISTS (SELECT 1 FROM information_schema.tables
         WHERE table_name = 'error_research_context' AND table_schema = 'public')
      `)
    ).rows[0].exists;

    if (apply && !linkTableExists) {
      log('error_research_context table does not exist — apply drizzle/manual/error_research_context.sql first', 'error');
      process.exit(1);
    }

    const params = [];
    let where = 'WHERE resolved = false';
    if (category) {
      params.push(category);
      where += ` AND error_category = $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT id, error_category, severity, message, file_path, packet_key, source_ref
       FROM error_logs ${where}
       ORDER BY CASE WHEN severity = 'CRITICAL' THEN 0 WHEN severity = 'ERROR' THEN 1 ELSE 2 END, created_at DESC
       LIMIT $${params.length}`,
      params
    );

    if (rows.length === 0) {
      log('No unresolved error_logs rows match the filter — nothing to do', 'info');
      return;
    }

    // ER1: dedupe by fingerprint within this batch, then against existing receipts.
    const seenInBatch = new Set();
    const candidates = [];
    for (const row of rows) {
      const fingerprint = computeFingerprint(row);
      if (seenInBatch.has(fingerprint)) continue;
      seenInBatch.add(fingerprint);
      candidates.push({ row, fingerprint, disposition: classifyDisposition(row.error_category) });
    }

    let toProcess = candidates;
    if (linkTableExists) {
      const existing = await pool.query(
        `SELECT error_fingerprint FROM error_research_context
         WHERE workspace_revision = $1 AND research_policy_revision = $2`,
        [workspaceRevision, POLICY_REVISION]
      );
      const already = new Set(existing.rows.map((r) => r.error_fingerprint));
      toProcess = candidates.filter((c) => !already.has(c.fingerprint));
    }

    log(`${rows.length} unresolved row(s) → ${candidates.length} unique fingerprint(s) → ${toProcess.length} not yet researched`, 'plan');

    const externalCount = toProcess.filter((c) => c.disposition === 'EXTERNAL_RESEARCH_REQUIRED').length;
    if (externalCount > MAX_EXTERNAL_RESEARCH_PER_RUN) {
      log(`${externalCount} require external research, capping at MAX_EXTERNAL_RESEARCH_PER_RUN=${MAX_EXTERNAL_RESEARCH_PER_RUN}`, 'warn');
    }

    if (!apply) {
      toProcess.forEach((c, i) => {
        console.log(`  ${i + 1}. [#${c.row.id}] fp=${c.fingerprint} ${c.row.error_category} → ${c.disposition}`);
      });
      console.log('\nDry-run only — pass --apply to hydrate ACE context and (conditionally) run LDR.');
      return;
    }

    const { runLocalDeepResearch } = await import('$lib/server/ldr/ldr-orchestrator.js');
    const { fetchCodebaseContext } = await import('$lib/server/features/ai/ace/context-assembler.js');

    let localOnly = 0;
    let researched = 0;
    let failed = 0;
    let externalUsed = 0;

    for (const { row, fingerprint, disposition } of toProcess) {
      try {
        // ER2: local ACE context FIRST, always — grounds any later LDR call
        // and is sufficient on its own for known structural categories.
        let codebaseContext = null;
        if (row.file_path) {
          try {
            codebaseContext = await fetchCodebaseContext(
              `${row.error_category}: ${normalizeMessage(row.message)}`,
              undefined,
              row.file_path
            );
          } catch (err) {
            log(`[#${row.id}] fetchCodebaseContext failed (non-fatal): ${err.message}`, 'warn');
          }
        }

        let researchStatus = 'LOCAL_ONLY';
        let researchQuery = null;
        let synthesis = null;
        let sources = [];
        let confidence = null;

        if (disposition === 'EXTERNAL_RESEARCH_REQUIRED' && externalUsed < MAX_EXTERNAL_RESEARCH_PER_RUN) {
          researchQuery = buildGroundedResearchQuery(row, codebaseContext);
          log(`[#${row.id}] EXTERNAL_RESEARCH_REQUIRED — researching: "${researchQuery.slice(0, 100)}..."`, 'info');
          try {
            const research = await runLocalDeepResearch(researchQuery, { maxWebResults: 8, maxDocumentsToFetch: 5 });
            synthesis = research.synthesis;
            sources = research.sources ?? [];
            confidence = research.confidence ?? null;
            researchStatus = 'RESEARCH_COMPLETE';
            externalUsed += 1;
            researched += 1;
          } catch (err) {
            researchStatus = 'RESEARCH_FAILED';
            log(`[#${row.id}] LDR research failed: ${err.message}`, 'error');
          }
        } else {
          localOnly += 1;
        }

        const localDigest = codebaseContext
          ? createHash('sha256').update(JSON.stringify(codebaseContext)).digest('hex').slice(0, 32)
          : null;

        await pool.query(
          `INSERT INTO error_research_context
             (error_log_id, error_fingerprint, packet_key, source_ref, workspace_revision,
              research_status, research_disposition, local_context_digest, codebase_context,
              research_query, research_synthesis, source_count, sources_json, research_confidence,
              research_policy_revision, completed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14,$15, now())
           ON CONFLICT (error_fingerprint, workspace_revision, research_policy_revision) DO UPDATE SET
             research_status = EXCLUDED.research_status,
             research_disposition = EXCLUDED.research_disposition,
             local_context_digest = EXCLUDED.local_context_digest,
             codebase_context = EXCLUDED.codebase_context,
             research_query = EXCLUDED.research_query,
             research_synthesis = EXCLUDED.research_synthesis,
             source_count = EXCLUDED.source_count,
             sources_json = EXCLUDED.sources_json,
             research_confidence = EXCLUDED.research_confidence,
             completed_at = now()`,
          [
            row.id,
            fingerprint,
            row.packet_key ?? null,
            row.source_ref ?? null,
            workspaceRevision,
            researchStatus,
            disposition,
            localDigest,
            codebaseContext ? JSON.stringify(codebaseContext) : null,
            researchQuery,
            synthesis,
            sources.length,
            JSON.stringify(sources),
            confidence,
            POLICY_REVISION,
          ]
        );

        log(`[#${row.id}] persisted status=${researchStatus} disposition=${disposition}`, 'info');
      } catch (err) {
        failed += 1;
        log(`[#${row.id}] failed: ${err.message}`, 'error');
      }
    }

    log(`\nDone: ${localOnly} local-only, ${researched} externally researched, ${failed} failed (of ${toProcess.length} processed)`, 'plan');
  } catch (err) {
    log(`Fatal error: ${err.message}`, 'error');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
