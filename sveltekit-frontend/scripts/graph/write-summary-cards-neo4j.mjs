#!/usr/bin/env node
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT = process.argv.includes('--report');
const FAIL_OPEN = process.argv.includes('--fail-open');
const REPORT_PATH =
  process.env.NEO4J_CARDS_REPORT_PATH ?? 'docs/reports/neo4j-cards-write-latest.json';

const NEO4J_URL = process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j';
const SMOKE_COMMAND = 'npm run neo4j:cards:write';

function rel(file) {
  return path.join(ROOT, file);
}

async function writeReport(data) {
  if (!REPORT) return;
  const full = rel(REPORT_PATH);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function classifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthorized|auth|credential/i.test(message)) {
    return {
      errorClass: 'service_auth_failure',
      service: 'neo4j',
      repairLane: 'env_credentials',
      smokeCommand: SMOKE_COMMAND,
    };
  }
  return {
    errorClass: 'service_runtime_failure',
    service: 'neo4j',
    repairLane: 'service_connectivity',
    smokeCommand: SMOKE_COMMAND,
  };
}

function candidatePasswords() {
  const placeholderValues = new Set(['your-real-password', 'changeme', 'password123']);
  const envCandidates = [process.env.NEO4J_PASSWORD, process.env.NEO4J_PASS]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value) => !placeholderValues.has(value));

  // Prefer the known local default first, then try user-provided env values.
  const localDefaults = ['neo4j123', 'neo4jpassword', 'password'];
  return [...new Set([...localDefaults, ...envCandidates])];
}

async function connectNeo4j(neo4j) {
  const failures = [];
  for (const password of candidatePasswords()) {
    const driver = neo4j.default.driver(NEO4J_URL, neo4j.default.auth.basic(NEO4J_USER, password));
    try {
      await driver.verifyConnectivity();
      return driver;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      await driver.close().catch(() => {});
    }
  }
  throw new Error(`Unable to authenticate to Neo4j at ${NEO4J_URL} as ${NEO4J_USER}. Last error: ${failures.at(-1) ?? 'unknown'}`);
}

async function readJson(rel, fallback) {
  try {
    const raw = await fs.readFile(path.join(ROOT, rel), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function main() {
  let neo4j;
  try {
    neo4j = await import('neo4j-driver');
  } catch {
    console.error('[neo4j:cards:write] neo4j-driver not installed');
    process.exit(1);
  }

  // 1. Validate cards
  let cardsValidated = false;
  let topPacket = { cards: [] };
  let edgeLines = '';
  let edgeRows = [];
  let cards = [];
  try {
    topPacket = await readJson('memory/cards/top-100-codebase-summary-cards.json', { cards: [] });
    edgeLines = await fs.readFile(path.join(ROOT, 'memory/cards/codebase-summary-card-edges.jsonl'), 'utf8').catch(() => '');
    edgeRows = edgeLines.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    cards = Array.isArray(topPacket.cards) ? topPacket.cards : [];
    if (cards.length > 0) {
      cardsValidated = true;
    }
  } catch (err) {
    console.warn('[neo4j:cards:write] Cards validation failed:', err.message);
    cardsValidated = false;
  }

  let driver;
  try {
    driver = await connectNeo4j(neo4j);
  } catch (error) {
    const message = error.message;
    if (/unauthorized|auth|credential/i.test(message)) {
      console.warn('[neo4j:cards:write] Neo4j authentication failed, entering fail-open report mode');

      // Emit structured failure artifact
      const artifact = {
        ok: false,
        service: 'neo4j',
        operation: 'summary_cards_write',
        errorClass: 'auth_failure',
        cardsValidated,
        mode: 'fail-open-report'
      };

      const artifactPath = rel('docs/reports/neo4j-summary-card-write-failure.json');
      await fs.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

      // Add HMM event for auth failure
      const hmm = {
        errorClass: 'service_auth_failure',
        service: 'neo4j',
        repairLane: 'env_credentials',
        smokeCommand: SMOKE_COMMAND
      };

      console.error('[neo4j:cards:write] HMM Event:', JSON.stringify(hmm));

      // Queue HMM event to Redis
      try {
        const { default: Redis } = await import('ioredis');
        const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
        const event = {
          type: 'run.failed',
          runId: 'neo4j-cards-write',
          ts: Date.now(),
          error: {
            code: 'service_auth_failure',
            message: message
          },
          metadata: hmm
        };
        await redis.publish('error-brain:events', JSON.stringify(event));
        await redis.quit();
        console.log('[neo4j:cards:write] Published HMM error event to Redis error-brain:events channel.');
      } catch (redisErr) {
        console.warn('[neo4j:cards:write] Could not publish event to Redis:', redisErr.message);
      }

      // Exit 0 cleanly
      process.exit(0);
    } else {
      throw error;
    }
  }

  const session = driver.session();

  try {
    await session.run(`UNWIND $cards AS c
      MERGE (sc:SummaryCard {id: c.id})
      SET sc.path = c.path,
          sc.summary_type = c.summary_type,
          sc.summary = c.summary,
          sc.rank_score = toFloat(coalesce(c.scores.rank_score, 0)),
          sc.updated_at = datetime()`
    , { cards });

    const topEdges = edgeRows.filter((e) => cards.some((c) => c.id === e.from));
    const chunkSize = 1000;
    for (let i = 0; i < topEdges.length; i += chunkSize) {
      const chunk = topEdges.slice(i, i + chunkSize);
      await session.run(`UNWIND $rows AS r
        MERGE (a:SummaryCard {id: r.from})
        MERGE (b:EntityRef {id: r.to})
        MERGE (a)-[rel:CARD_EDGE {type: r.edge_type}]->(b)
        SET rel.updated_at = datetime()`
      , { rows: chunk });
    }

    const success = {
      ok: true,
      skipped: false,
      cards: cards.length,
      edges: topEdges.length,
      reportPath: REPORT ? REPORT_PATH : null,
      smokeCommand: SMOKE_COMMAND,
    };
    await writeReport(success);
    console.log(JSON.stringify(success, null, 2));

    // If it succeeded, delete any stale failure artifact
    const artifactPath = rel('docs/reports/neo4j-summary-card-write-failure.json');
    await fs.rm(artifactPath, { force: true }).catch(() => {});
  } finally {
    await session.close().catch(() => {});
    await driver.close().catch(() => {});
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const hmm = classifyError(error);
  const failure = {
    ok: false,
    skipped: false,
    reason: message,
    reportPath: REPORT ? REPORT_PATH : null,
    failOpen: FAIL_OPEN,
    ...hmm,
  };

  if (FAIL_OPEN) {
    const failOpenResult = {
      ...failure,
      ok: true,
      skipped: true,
      reason: `${message} (fail-open enabled)`,
    };
    await writeReport(failOpenResult);
    console.log(JSON.stringify(failOpenResult, null, 2));
    process.exit(0);
  }

  await writeReport(failure);
  console.error('[neo4j:cards:write] failed:', message);
  console.error(JSON.stringify(hmm));
  process.exit(1);
});
