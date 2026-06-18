#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryNeo4jHttp } from '../atlas/lib/neo4j-http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INPUT_PATH = path.join(REPO_ROOT, '.tmp', 'turbovec-neighbors.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'neo4j-turbovec-import.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'neo4j-turbovec-import.md');
const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const INPUT_ARG = argv.find((arg) => arg.startsWith('--input='));
const INPUT_FILE = INPUT_ARG ? path.resolve(REPO_ROOT, INPUT_ARG.split('=')[1]) : INPUT_PATH;
const LIMIT = parseIntFlag(argv, '--limit', 0);
const SAMPLE = parseIntFlag(argv, '--sample', 8);

function parseIntFlag(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && idx < args.length - 1) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function parseNdjson(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          __invalid: true,
          __line: index + 1,
          __error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}

function normalizeRow(row) {
  return {
    source_id: normalizeText(row.source_id ?? row.sourceId ?? row.from_id ?? row.fromId ?? row.packet_key ?? row.packetKey ?? row.id ?? ''),
    neighbor_id: normalizeText(row.neighbor_id ?? row.neighborId ?? row.target_id ?? row.targetId ?? row.to_id ?? row.toId ?? row.peer_id ?? row.peerId ?? ''),
    similarity: row.similarity ?? row.score ?? row.distance ?? null,
    topk_rank: row.topk_rank ?? row.rank ?? row.topKRank ?? null,
    source: normalizeText(row.source ?? 'turbovec'),
  };
}

async function main() {
  const raw = await fs.readFile(INPUT_FILE, 'utf8').catch(() => '');
  const rows = parseNdjson(raw).filter((row) => row && !row.__invalid).map(normalizeRow).filter((row) => row.source_id && row.neighbor_id);
  const selected = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    inputPath: path.relative(REPO_ROOT, INPUT_FILE).replace(/\\/g, '/'),
    summary: {
      rowsRead: rows.length,
      rowsSelected: selected.length,
      rowsImported: 0,
      rowsSkipped: rows.length - selected.length,
      qdrantReachable: null,
      neo4jReachable: false,
      failures: 0,
    },
    samples: selected.slice(0, SAMPLE),
    status: 'NO_INPUT',
    nextSafeAction: 'Generate .tmp/turbovec-neighbors.ndjson from the dense-lane candidate generator, then rerun with --apply.',
  };

  if (rows.length === 0) {
    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');
    console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
    console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
    console.log(JSON.stringify({ status: report.status, rowsRead: 0, rowsImported: 0 }, null, 2));
    return;
  }

  const probe = await probeNeo4j();
  report.summary.neo4jReachable = Boolean(probe.ok);
  report.summary.transport = probe.transport;
  report.status = probe.ok ? (APPLY_REQUESTED ? 'APPLIED' : 'DRY_RUN_READY') : 'NEO4J_UNAVAILABLE';
  report.nextSafeAction = probe.ok
    ? (APPLY_REQUESTED
      ? 'Review the imported relationship counts, then keep the Neo4j/GDS pass bounded.'
      : 'Review the dry-run edge plan, then rerun with --apply when the input lane is ready.')
    : 'Fix Neo4j connectivity before trying to import turbovec edges.';

  if (APPLY_REQUESTED && probe.ok) {
    const result = await writeEdges(probe.transport, selected);
    if (!result.ok) {
      report.summary.failures += 1;
      report.status = 'APPLY_WITH_ERRORS';
    } else {
      report.summary.rowsImported = Number(result.rows?.[0]?.count ?? selected.length);
    }
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  console.log(JSON.stringify({
    status: report.status,
    rowsRead: report.summary.rowsRead,
    rowsImported: report.summary.rowsImported,
    neo4jReachable: report.summary.neo4jReachable,
  }, null, 2));
}

async function probeNeo4j() {
  const httpProbe = await queryNeo4jHttp({ statement: 'RETURN 1 AS ok' });
  if (httpProbe.ok) return { ok: true, transport: 'http', details: httpProbe };

  try {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      NEO4J_URI,
      neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    );
    const session = driver.session();
    try {
      await session.run('RETURN 1 AS ok');
      return { ok: true, transport: 'bolt', driver };
    } finally {
      await session.close().catch(() => {});
      await driver.close().catch(() => {});
    }
  } catch (error) {
    return { ok: false, transport: 'unavailable', error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeEdges(transport, rows) {
  if (transport === 'http') {
    return queryNeo4jHttp({
      statement: `
        UNWIND $rows AS row
        MERGE (a:Packet {id: row.source_id})
        MERGE (b:Packet {id: row.neighbor_id})
        MERGE (a)-[r:SIMILAR_TO {source: 'turbovec', topk_rank: row.topk_rank}]->(b)
        SET r.similarity = row.similarity,
            r.topk_rank = row.topk_rank,
            r.source = 'turbovec',
            r.updated_at = datetime()
        RETURN count(r) AS count
      `,
      parameters: { rows },
    });
  }

  const neo4j = await import('neo4j-driver');
  const driver = neo4j.default.driver(NEO4J_URI, neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
          UNWIND $rows AS row
          MERGE (a:Packet {id: row.source_id})
          MERGE (b:Packet {id: row.neighbor_id})
          MERGE (a)-[r:SIMILAR_TO {source: 'turbovec', topk_rank: row.topk_rank}]->(b)
          SET r.similarity = row.similarity,
              r.topk_rank = row.topk_rank,
              r.source = 'turbovec',
              r.updated_at = datetime()
          RETURN count(r) AS count
        `,
        { rows },
      )
    );
    return {
      ok: true,
      rows: result.records.map((record) => ({ count: record.get('count') })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await session.close().catch(() => {});
    await driver.close().catch(() => {});
  }
}

function renderMarkdown(report) {
  return [
    '# Neo4j TurboVec Import',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- rows read: ${report.summary.rowsRead}`,
    `- rows selected: ${report.summary.rowsSelected}`,
    `- rows imported: ${report.summary.rowsImported}`,
    `- rows skipped: ${report.summary.rowsSkipped}`,
    `- neo4j reachable: ${report.summary.neo4jReachable ? 'yes' : 'no'}`,
    `- failures: ${report.summary.failures}`,
    '',
    '## Samples',
    '',
    ...report.samples.map((row) => `- ${row.source_id} -> ${row.neighbor_id} | similarity=${row.similarity ?? 'n/a'} | rank=${row.topk_rank ?? 'n/a'}`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

main().catch((error) => {
  console.error('[import-turbovec-edges] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
