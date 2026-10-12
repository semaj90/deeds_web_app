#!/usr/bin/env node
/**
 * openspec-task-fts-index-v1.mjs
 *
 * Read-only, database-free preview of the OpenSpec tasks/proposals full-text
 * index. It parses openspec/changes/<change>/{proposal,tasks}.md into rows that
 * mirror the existing Drizzle tables (openspec_changes / openspec_tasks shape),
 * builds an in-memory BM25-style index, and writes a receipt. Nothing is written
 * to PostgreSQL; the planned DDL is recorded in the receipt for review only.
 *
 * Usage:
 *   node scripts/atlas/openspec-task-fts-index-v1.mjs                 # receipt + self-check
 *   node scripts/atlas/openspec-task-fts-index-v1.mjs --query "simdjson"
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHANGES_DIR = path.join(ROOT, 'openspec', 'changes');
const OUT_PATH = path.join(ROOT, '.tmp', 'atlas', 'openspec-task-fts-index-v1.json');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'not', 'but',
  'all', 'any', 'its', 'via', 'use', 'when', 'only', 'does', 'must', 'can', 'may',
]);

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const TASK_LINE = /^\s*- \[( |x|X)\] (.*)$/;
const TASK_ID = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/;

/** Parse tasks.md checkbox items; continuation lines (indented) join the item. */
export function parseTasks(markdown, change, source) {
  const rows = [];
  const lines = markdown.split(/\r?\n/);
  let current = null;
  lines.forEach((line, idx) => {
    const m = TASK_LINE.exec(line);
    if (m) {
      if (current) rows.push(current);
      const text = m[2].replace(/\*\*/g, '').trim();
      const id = (TASK_ID.exec(text) || [null, null])[1];
      current = { change, source, line: idx + 1, state: m[1].toLowerCase() === 'x' ? 'DONE' : 'OPEN', taskId: id, text };
    } else if (current && /^\s+\S/.test(line)) {
      current.text += ` ${line.trim()}`;
    } else if (current && line.trim() === '') {
      // blank line ends the item only when followed by a non-indented line
    } else if (current) {
      rows.push(current);
      current = null;
    }
  });
  if (current) rows.push(current);
  return rows.map((r) => ({ ...r, text: r.text.trim(), taskKey: `${change}:${r.line}` }));
}

const sha256 = (s) => `sha256:${crypto.createHash('sha256').update(s, 'utf8').digest('hex')}`;

/**
 * Map parsed rows onto the existing Drizzle contracts in
 * openspec-evidence-schema.ts (openspec_changes / openspec_tasks). Fields the
 * schema requires but this preview cannot prove (workspaceRevision) are null and
 * listed under blockers, so nothing is silently defaulted.
 */
export function toDrizzleRows({ changes, tasks, proposals, tasksHashes, proposalHashes }) {
  const proposalByChange = new Map(proposals.map((p) => [p.change, p]));
  const changeRows = changes.map((change) => ({
    changeId: change,
    path: `openspec/changes/${change}`,
    proposalHash: proposalHashes.get(change) ?? null,
    tasksHash: tasksHashes.get(change) ?? null,
    workspaceRevision: null,
    status: 'ACTIVE',
    blockers: ['WORKSPACE_REVISION_UNRESOLVED'],
    title: proposalByChange.get(change)?.title ?? null,
  }));
  const taskRows = tasks.map((t) => ({
    canonicalTaskKey: t.taskKey,
    authorityScope: 'OPENSPEC_TASKS_MD',
    declaredTaskId: t.taskId,
    identityKind: t.taskId ? 'DECLARED_ID' : 'POSITIONAL',
    lifecycleState: 'ACTIVE',
    changeId: t.change,
    taskId: t.taskId ?? `L${t.line}`,
    taskRef: `${t.source}#L${t.line}`,
    taskText: t.text,
    taskHash: sha256(t.text),
    declaredChecked: t.state === 'DONE',
    taskIdStatus: t.taskId ? 'DECLARED' : 'MISSING',
    workspaceRevision: null,
    blockers: ['WORKSPACE_REVISION_UNRESOLVED'],
  }));
  return { openspecChanges: changeRows, openspecTasks: taskRows };
}

export function parseProposal(markdown, change, source) {
  const title = (/^#\s+(.+)$/m.exec(markdown) || [null, change])[1].trim();
  return { change, source, title, body: markdown.trim() };
}

export function loadRows(changesDir = CHANGES_DIR) {
  const tasks = [];
  const proposals = [];
  const changes = [];
  const tasksHashes = new Map();
  const proposalHashes = new Map();
  for (const change of fs.readdirSync(changesDir).sort()) {
    const dir = path.join(changesDir, change);
    if (!fs.statSync(dir).isDirectory() || change === 'archive') continue;
    changes.push(change);
    const tasksPath = path.join(dir, 'tasks.md');
    const proposalPath = path.join(dir, 'proposal.md');
    if (fs.existsSync(tasksPath)) {
      const raw = fs.readFileSync(tasksPath, 'utf8');
      const rel = path.relative(ROOT, tasksPath).split(path.sep).join('/');
      tasksHashes.set(change, sha256(raw));
      tasks.push(...parseTasks(raw, change, rel));
    }
    if (fs.existsSync(proposalPath)) {
      const raw = fs.readFileSync(proposalPath, 'utf8');
      const rel = path.relative(ROOT, proposalPath).split(path.sep).join('/');
      proposalHashes.set(change, sha256(raw));
      proposals.push(parseProposal(raw, change, rel));
    }
  }
  return { changes, tasks, proposals, tasksHashes, proposalHashes };
}

/** BM25 over documents {id, text}; k1/b are the standard defaults. */
export function buildIndex(docs, { k1 = 1.2, b = 0.75 } = {}) {
  const df = new Map();
  const tf = new Map();
  let totalLen = 0;
  for (const d of docs) {
    const tokens = tokenize(d.text);
    totalLen += tokens.length;
    const counts = new Map();
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    tf.set(d.id, { counts, len: tokens.length });
    for (const t of counts.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const avgLen = docs.length ? totalLen / docs.length : 0;
  const n = docs.length;
  return {
    search(query, limit = 10) {
      const qTokens = [...new Set(tokenize(query))];
      const scored = [];
      for (const [id, { counts, len }] of tf) {
        let score = 0;
        for (const t of qTokens) {
          const f = counts.get(t);
          if (!f) continue;
          const idf = Math.log(1 + (n - df.get(t) + 0.5) / (df.get(t) + 0.5));
          score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (len / avgLen)));
        }
        if (score > 0) scored.push({ id, score: Number(score.toFixed(4)) });
      }
      return scored.sort((a, b2) => b2.score - a.score || (a.id < b2.id ? -1 : 1)).slice(0, limit);
    },
    stats: () => ({ docs: n, uniqueTerms: df.size, avgTokens: Number(avgLen.toFixed(2)) }),
  };
}

export function searchOpenSpecClaims(query, { changesDir = CHANGES_DIR, limit = 10 } = {}) {
  const normalizedQuery = String(query ?? '').trim();
  if (!normalizedQuery || normalizedQuery.length > 512) {
    throw new Error('OPENSPEC_SEARCH_QUERY_INVALID');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('OPENSPEC_SEARCH_LIMIT_INVALID');
  }

  const { tasks, proposals, tasksHashes, proposalHashes } = loadRows(changesDir);
  const documents = [
    ...tasks.map((task) => ({ id: task.taskKey, kind: 'TASK', task })),
    ...proposals.map((proposal) => ({ id: `${proposal.change}:proposal`, kind: 'PROPOSAL', proposal })),
  ].map((document) => ({
    ...document,
    text: document.kind === 'TASK'
      ? `${document.task.taskId ?? ''} ${document.task.text}`
      : `${document.proposal.title} ${document.proposal.body}`,
  }));
  const index = buildIndex(documents.map(({ id, text }) => ({ id, text })));
  const byId = new Map(documents.map((document) => [document.id, document]));
  const hits = index.search(normalizedQuery, limit).map(({ id, score }) => {
    const document = byId.get(id);
    if (document.kind === 'TASK') {
      return {
        kind: document.kind,
        changeId: document.task.change,
        taskId: document.task.taskId,
        taskRef: `${document.task.source}#L${document.task.line}`,
        claim: document.task.text,
        ledgerCheckbox: document.task.state,
        ledgerContentDigest: tasksHashes.get(document.task.change) ?? null,
        score,
      };
    }
    return {
      kind: document.kind,
      changeId: document.proposal.change,
      taskRef: document.proposal.source,
      title: document.proposal.title,
      excerpt: document.proposal.body.slice(0, 500),
      ledgerContentDigest: proposalHashes.get(document.proposal.change) ?? null,
      score,
    };
  });

  return {
    schema: 'atlas.openspec-claim-search.v1',
    status: 'CLAIM_SEARCH_ONLY',
    query: normalizedQuery,
    workspaceRevision: null,
    canonicalAuthority: false,
    evidenceAdmission: false,
    writesPerformed: false,
    index: index.stats(),
    hits,
  };
}

const PLANNED_DDL = [
  "ALTER TABLE openspec_tasks ADD COLUMN IF NOT EXISTS search_tsv tsvector",
  "  GENERATED ALWAYS AS (to_tsvector('english', coalesce(declared_task_id,'') || ' ' || coalesce(task_text,''))) STORED;",
  'CREATE INDEX IF NOT EXISTS openspec_tasks_search_tsv_gin ON openspec_tasks USING GIN (search_tsv);',
];

function main() {
  const argIdx = process.argv.indexOf('--query');
  const query = argIdx >= 0 ? process.argv[argIdx + 1] : null;
  const { changes, tasks, proposals, tasksHashes, proposalHashes } = loadRows();
  const drizzle = toDrizzleRows({ changes, tasks, proposals, tasksHashes, proposalHashes });

  const docs = [
    ...tasks.map((t) => ({ id: t.taskKey, text: `${t.taskId || ''} ${t.text}` })),
    ...proposals.map((p) => ({ id: `${p.change}:proposal`, text: `${p.title} ${p.body}` })),
  ];
  const index = buildIndex(docs);
  const byId = new Map(docs.map((d) => [d.id, d]));

  const selfCheck = ['simdjson', 'bitmap', 'drizzle migration', 'turbovec', 'langextract', 'WORKSTATION-PROGRESS-RECEIPT-01']
    .map((q) => ({ query: q, hits: index.search(q, 3).map((h) => ({ ...h, text: byId.get(h.id).text.slice(0, 120) })) }));

  const receipt = {
    schema: 'atlas.openspec-task-fts-index.preview.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writesPerformed: false,
    databaseTouched: false,
    counts: {
      changes: changes.length,
      proposals: proposals.length,
      tasks: tasks.length,
      tasksDone: tasks.filter((t) => t.state === 'DONE').length,
      tasksWithId: tasks.filter((t) => t.taskId).length,
    },
    index: index.stats(),
    drizzleShape: {
      source: 'sveltekit-frontend/src/lib/server/db/openspec-evidence-schema.ts',
      openspecChanges: drizzle.openspecChanges.length,
      openspecTasks: drizzle.openspecTasks.length,
      rowsWithUnresolvedWorkspaceRevision: drizzle.openspecTasks.filter((r) => r.workspaceRevision === null).length,
      status: 'SHAPE_MAPPED_NOT_ADMITTED',
      blocker: 'WORKSPACE_REVISION_UNRESOLVED',
    },
    plannedDdl: PLANNED_DDL,
    selfCheck,
    corpusChecksum: `sha256:${crypto.createHash('sha256').update(docs.map((d) => d.id).join('\n')).digest('hex')}`,
  };

  if (query) {
    receipt.query = { q: query, hits: index.search(query, 10).map((h) => ({ ...h, text: byId.get(h.id).text.slice(0, 160) })) };
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'PREVIEW_INDEX_BUILT', counts: receipt.counts, index: receipt.index, reportPath: '.tmp/atlas/openspec-task-fts-index-v1.json', ...(query ? { query: receipt.query } : {}) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
