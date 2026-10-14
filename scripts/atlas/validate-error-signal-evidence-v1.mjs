#!/usr/bin/env node
/**
 * Read-only evidence validator for error_signal_stream.
 *
 * Gate between raw error signals and any classifier or repair proposal:
 *   signal → provenance check → live re-check of the claim → verdict + receipt
 *
 * It never writes to Postgres, never edits source, never calls a model, and
 * never marks a signal repair-eligible. Every verdict is evidence about the
 * current database, not authorization to change anything.
 *
 * Usage:
 *   node scripts/atlas/validate-error-signal-evidence-v1.mjs [--limit 500] [--out .tmp/atlas/error-signal-evidence-v1.json]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const limit = Math.min(Math.max(Number.parseInt(getArg('--limit', '500'), 10) || 500, 1), 5000);
const outPath = path.resolve(REPO_ROOT, getArg('--out', '.tmp/atlas/error-signal-evidence-v1.json'));

// Verdicts. None of them grants repair authority.
export const VERDICT = Object.freeze({
  REPRODUCES_NOW: 'REPRODUCES_NOW',
  NOT_REPRODUCED_NOW: 'NOT_REPRODUCED_NOW',
  PARTIALLY_REPRODUCED: 'PARTIALLY_REPRODUCED',
  UNVERIFIED: 'UNVERIFIED',
  PROPOSAL_ONLY: 'PROPOSAL_ONLY',
});

const RELATION_RE = /relation "?([\w.]+)"? does not exist|relation does not exist:\s*"?([\w.]+)"?/i;
const COLUMN_RE = /column "?([\w.]+)"? does not exist/i;

export function classifyClaim(signal) {
  const message = String(signal.evidence?.message ?? '');
  if (signal.error_class === 'audit_recommendation') {
    return { kind: 'PROPOSAL', verdict: VERDICT.PROPOSAL_ONLY, checkKey: null };
  }
  const relation = message.match(RELATION_RE);
  if (relation) return { kind: 'RELATION_EXISTS', verdict: null, checkKey: relation[1] ?? relation[2] };
  const column = message.match(COLUMN_RE);
  if (column) return { kind: 'COLUMN_EXISTS', verdict: null, checkKey: column[1] };
  // Retrieval misses need the owning query and a live Qdrant read; this
  // validator does not run retrieval, so it cannot reproduce them.
  return { kind: 'UNCHECKABLE', verdict: VERDICT.UNVERIFIED, checkKey: null };
}

export function ageDays(ingestedAt, now = new Date()) {
  return Math.floor((now.getTime() - new Date(ingestedAt).getTime()) / 86_400_000);
}

async function main() {
  const env = loadRepoEnv();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl(env) });
  await client.connect();
  const started = new Date();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");

    const signals = (await client.query(
      `SELECT id, packet_key, task_id, error_class, model_name, evidence, ingested_at
         FROM public.error_signal_stream
        ORDER BY ingested_at DESC, id DESC
        LIMIT $1`,
      [limit],
    )).rows;

    const batches = new Map();
    for (const s of signals) {
      const key = new Date(s.ingested_at).toISOString();
      batches.set(key, (batches.get(key) ?? 0) + 1);
    }
    const singleBatch = batches.size === 1 && signals.length > 1;

    const checked = [];
    for (const s of signals) {
      const claim = classifyClaim(s);
      const row = {
        id: s.id,
        errorClass: s.error_class,
        modelName: s.model_name,
        ageDays: ageDays(s.ingested_at, started),
        provenance: {
          ingestedAt: new Date(s.ingested_at).toISOString(),
          batchSize: batches.get(new Date(s.ingested_at).toISOString()),
          singleBatchTable: singleBatch,
          modelIsLiveChatLane: /ornith/i.test(s.model_name),
        },
        claimKind: claim.kind,
        verdict: claim.verdict,
        liveCheck: null,
        repairEligible: false,
      };

      if (claim.kind === 'RELATION_EXISTS') {
        const r = await client.query('SELECT to_regclass($1) AS oid', [claim.checkKey]);
        const exists = r.rows[0].oid !== null;
        row.liveCheck = { target: claim.checkKey, existsNow: exists };
        row.verdict = exists ? VERDICT.NOT_REPRODUCED_NOW : VERDICT.REPRODUCES_NOW;
      } else if (claim.kind === 'COLUMN_EXISTS') {
        const r = await client.query(
          `SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = $1`,
          [claim.checkKey],
        );
        const tables = r.rows.map((x) => x.table_name);
        row.liveCheck = { target: claim.checkKey, tablesWithColumnNow: tables.length, tables: tables.slice(0, 10) };
        // The owning query is not known from the signal, so a column that
        // exists somewhere only partially reproduces the historical error.
        row.verdict = tables.length === 0 ? VERDICT.REPRODUCES_NOW : VERDICT.PARTIALLY_REPRODUCED;
      } else if (claim.verdict) {
        row.verdict = claim.verdict;
      }

      checked.push(row);
    }

    await client.query('COMMIT');

    const tally = {};
    for (const r of checked) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;

    const receipt = {
      schema: 'atlas.error_signal_evidence.v1',
      generatedAt: started.toISOString(),
      readOnly: true,
      writesPerformed: 0,
      canonicalAuthority: false,
      rowsRequested: limit,
      rowsRead: signals.length,
      singleBatchTable: singleBatch,
      verdictTally: tally,
      rows: checked,
      selfDigest: null,
    };
    const body = JSON.stringify({ ...receipt, selfDigest: undefined });
    receipt.selfDigest = `sha256:${createHash('sha256').update(body).digest('hex')}`;

    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);

    console.log(`ERROR_SIGNAL_EVIDENCE_V1 rows=${signals.length} singleBatch=${singleBatch} writes=0`);
    console.log(`verdicts=${JSON.stringify(tally)}`);
    console.log(`receipt=${outPath}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`ERROR_SIGNAL_EVIDENCE_V1 FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
