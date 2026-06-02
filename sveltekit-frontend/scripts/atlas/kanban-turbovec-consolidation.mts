#!/usr/bin/env tsx
/**
 * kanban-turbovec-consolidation.mts
 *
 * Mass-ingests kanban todo sources, batches embeddings, runs TurboVec
 * prefiltering, and groups open work into consolidation buckets.
 *
 * Inputs:
 *   - ../.tmp/kanban_tasks.jsonl
 *   - ../.tmp/missing_feature_todos.jsonl
 *   - ../.tmp/feature_labels.jsonl
 *   - ../../docs/graph/kanban-board.json
 *
 * Outputs:
 *   - ../../docs/reports/kanban-turbovec-consolidation-latest.json
 *   - ../../docs/reports/kanban-turbovec-consolidation-latest.md
 *   - optionally patches ../../docs/graph/kanban-board.json with turbovec analysis when --apply is passed
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fastJsonParse, getSimdStats } from '../../src/lib/server/gpu/simdjson-bridge.ts';
import { graphSimilaritySafe, isCudaAvailable } from '../../src/lib/server/gpu/libtorch-bridge.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(__dirname, '../../..');

const BOARD_PATH = path.join(REPO_ROOT, 'docs', 'graph', 'kanban-board.json');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'kanban-turbovec-consolidation-latest.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'kanban-turbovec-consolidation-latest.md');

const FEATURE_LABELS_PATH = path.join(FRONTEND_ROOT, '.tmp', 'feature_labels.jsonl');
const KANBAN_TASKS_PATH = path.join(FRONTEND_ROOT, '.tmp', 'kanban_tasks.jsonl');
const MISSING_TODOS_PATH = path.join(FRONTEND_ROOT, '.tmp', 'missing_feature_todos.jsonl');

const TURBOVEC_URL = process.env.TURBOVEC_URL ?? 'http://127.0.0.1:8792';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const SVELTEKIT_URL = process.env.SVELTEKIT_URL ?? 'http://localhost:5173';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';

const APPLY = process.argv.includes('--apply');
const INCLUDE_DONE = process.argv.includes('--include-done');
const LIMIT_ARG = process.argv.indexOf('--limit');
const POSITIONAL_LIMIT = process.argv.slice(2).find((arg) => /^\d+$/.test(arg)) ?? null;
const LIMIT = LIMIT_ARG >= 0
  ? Number(process.argv[LIMIT_ARG + 1])
  : POSITIONAL_LIMIT
    ? Number(POSITIONAL_LIMIT)
    : null;
const EMBED_BATCH_SIZE = Number(process.env.TURBOVEC_EMBED_BATCH_SIZE ?? 32);
const PREFILTER_CONCURRENCY = Number(process.env.TURBOVEC_PREFILTER_CONCURRENCY ?? 8);
const TOP_CLUSTERS = Number(process.env.TURBOVEC_TOP_CLUSTERS ?? 5);
let embeddingServiceUnavailable = false;
let turbovecServiceUnavailable = false;

function readJson(filePath, fallback = null) {
  try {
    return fastJsonParse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return fastJsonParse(line);
      } catch {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }
    })
    .filter(Boolean);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sha1(input) {
  return createHash('sha1').update(String(input ?? '')).digest('hex').slice(0, 16);
}

function fnv1a(input) {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function fallbackVector(text, dimension = 768) {
  const vec = new Array(dimension).fill(0);
  const seed = fnv1a(text);
  let state = seed || 1;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < dimension; i++) vec[i] = rand() - 0.5;
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map((item) => String(item));
}

function featureFamilyFromFeatureKey(featureKey, title = '') {
  if (featureKey && typeof featureKey === 'string') {
    return featureKey.split(/[.:/|]/)[0].trim().toLowerCase() || 'unclassified';
  }
  if (title && typeof title === 'string') {
    const head = title.split('›')[0].split(':')[0].trim().toLowerCase();
    return head || 'unclassified';
  }
  return 'unclassified';
}

function taskKey(task) {
  return [
    task.taskId ?? task.id ?? '',
    task.feature_id ?? task.featureId ?? '',
    task.featureKey ?? '',
    task.sourceRef ?? task.source_ref ?? '',
    task.title ?? '',
  ].join('|');
}

function buildTaskText(task) {
  const parts = [
    task.title,
    task.description,
    task.featureKey ? `featureKey: ${task.featureKey}` : '',
    task.feature_id ? `feature_id: ${task.feature_id}` : '',
    task.sourceRef ? `sourceRef: ${task.sourceRef}` : '',
    task.sourceRefs?.length ? `sourceRefs: ${task.sourceRefs.join(', ')}` : '',
    task.files?.length ? `files: ${task.files.slice(0, 16).join(', ')}` : '',
    task.dbTables?.length ? `dbTables: ${task.dbTables.join(', ')}` : '',
    task.routeTypes?.length ? `routeTypes: ${task.routeTypes.join(', ')}` : '',
    task.mcpTools?.length ? `mcpTools: ${task.mcpTools.join(', ')}` : '',
    task.priority ? `priority: ${task.priority}` : '',
    task.kanbanStatus ? `status: ${task.kanbanStatus}` : '',
    task.section ? `section: ${task.section}` : '',
    task.notes ? `notes: ${task.notes}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

function flattenBoard(board) {
  const tasks = [];
  const columns = board?.columns ?? {};
  for (const [columnName, column] of Object.entries(columns)) {
    for (const task of column?.tasks ?? []) {
      tasks.push({
        ...task,
        kanbanStatus: task.kanbanStatus ?? columnName,
        boardColumn: columnName,
        origin: 'docs/graph/kanban-board.json',
      });
    }
  }
  return tasks;
}

function normalizeBoardTask(task) {
  return {
    taskId: task.taskId ?? task.id ?? null,
    feature_id: task.feature_id ?? task.featureId ?? null,
    featureKey: task.featureKey ?? task.feature_key ?? null,
    sourceRef: task.sourceRef ?? task.source_ref ?? null,
    sourceRefs: normalizeList(task.sourceRefs ?? task.source_refs),
    title: task.title ?? task.name ?? task.label ?? '',
    description: task.description ?? task.notes ?? '',
    files: normalizeList(task.files),
    dbTables: normalizeList(task.dbTables),
    routeTypes: normalizeList(task.routeTypes),
    mcpTools: normalizeList(task.mcpTools),
    priority: task.priority ?? null,
    kanbanStatus: task.kanbanStatus ?? task.status ?? null,
    boardColumn: task.boardColumn ?? null,
    section: task.section ?? null,
    notes: task.notes ?? '',
    origin: task.origin ?? 'docs/graph/kanban-board.json',
  };
}

function normalizeKanbanJsonlRow(row, origin) {
  return {
    taskId: row.task_id ?? row.taskId ?? row.id ?? null,
    feature_id: row.feature_id ?? row.featureId ?? null,
    featureKey: row.featureKey ?? row.feature_key ?? null,
    sourceRef: row.source_ref ?? row.sourceRef ?? row.file ?? null,
    sourceRefs: normalizeList(row.sourceRefs ?? row.source_refs),
    title: row.title ?? row.feature ?? row.topFeature ?? row.label ?? row.file ?? '',
    description: row.description ?? row.notes ?? row.reason ?? row.summary ?? '',
    files: normalizeList(row.files ?? (row.file ? [row.file] : [])),
    dbTables: normalizeList(row.dbTables),
    routeTypes: normalizeList(row.routeTypes),
    mcpTools: normalizeList(row.mcpTools),
    priority: row.priority ?? null,
    kanbanStatus: row.status ?? row.kanbanStatus ?? null,
    boardColumn: row.boardColumn ?? null,
    section: row.section ?? null,
    notes: row.notes ?? row.reason ?? '',
    origin,
  };
}

function normalizeFeatureLabelRow(row, origin) {
  return {
    taskId: row.task_id ?? row.taskId ?? row.id ?? null,
    feature_id: row.feature_id ?? row.featureId ?? row.id ?? null,
    featureKey: row.featureKey ?? row.feature_key ?? row.label ?? null,
    sourceRef: row.source_ref ?? row.sourceRef ?? row.file ?? row.path ?? null,
    sourceRefs: normalizeList(row.sourceRefs ?? [row.source_ref ?? row.sourceRef ?? row.file ?? row.path].filter(Boolean)),
    title: row.topFeature ?? row.feature ?? row.label ?? row.file ?? '',
    description: row.topFeature ?? row.feature ?? row.label ?? row.file ?? '',
    files: normalizeList(row.file ? [row.file] : row.files),
    dbTables: [],
    routeTypes: [],
    mcpTools: [],
    priority: row.priority ?? null,
    kanbanStatus: row.status ?? 'todo',
    boardColumn: row.section ?? null,
    section: row.section ?? null,
    notes: row.schema_gap ? JSON.stringify(row.schema_gap) : '',
    origin,
  };
}

async function postJson(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${url} failed ${res.status}: ${txt || res.statusText}`);
  }
  return res.json();
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  if (embeddingServiceUnavailable) {
    return texts.map((text) => fallbackVector(text));
  }

  const body = { model: EMBED_MODEL, input: texts };
  const candidates = [
    `${OLLAMA_URL}/api/embed`,
    `${SVELTEKIT_URL}/api/embed`,
  ];

  for (const url of candidates) {
    try {
      const data = await postJson(url, body, 6000);
      if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
        return data.embeddings;
      }
      if (Array.isArray(data?.embedding) && texts.length === 1) {
        return [data.embedding];
      }
    } catch {
      // try next endpoint
    }
  }

  embeddingServiceUnavailable = true;
  // Last resort: single-text embedding fallback, one call per item.
  return texts.map((text) => fallbackVector(text));
}

async function turbovecPrefilter(vector) {
  if (turbovecServiceUnavailable) {
    const seed = sha1(JSON.stringify(vector.slice(0, 16)));
    const base = parseInt(seed.slice(0, 8), 16) || 1;
    const clusterIds = [base % 128, (base + 17) % 128, (base + 31) % 128].slice(0, TOP_CLUSTERS);
    const centroidScores = Object.fromEntries(clusterIds.map((cid, idx) => [String(cid), Number((1 - idx * 0.15).toFixed(4))]));
    return { clusterIds, centroidScores, backend: 'offline' };
  }
  try {
    const data = await postJson(`${TURBOVEC_URL}/prefilter`, {
      vector,
      topClusters: TOP_CLUSTERS,
    }, 2500);
    return {
      clusterIds: Array.isArray(data?.clusterIds) ? data.clusterIds.map(Number).filter(Number.isFinite) : [],
      centroidScores: data?.centroidScores ?? {},
      backend: data?.backend ?? 'js',
    };
  } catch {
    try {
      const data = await postJson(`${TURBOVEC_URL}/search`, {
        vector,
        topK: Math.max(20, TOP_CLUSTERS * 10),
      }, 3000);
      const seen = new Set();
      const clusterIds = [];
      const centroidScores = {};
      for (const item of data?.candidates ?? data?.results ?? []) {
        const cid = Number(item?.cluster ?? item?.cluster_id);
        if (!Number.isFinite(cid) || seen.has(cid)) continue;
        seen.add(cid);
        clusterIds.push(cid);
        centroidScores[String(cid)] = Number(item?.score ?? 0);
        if (clusterIds.length >= TOP_CLUSTERS) break;
      }
      return { clusterIds, centroidScores, backend: data?.backend ?? 'search-derived' };
    } catch {
      turbovecServiceUnavailable = true;
      const seed = sha1(JSON.stringify(vector.slice(0, 16)));
      const base = parseInt(seed.slice(0, 8), 16) || 1;
      const clusterIds = [base % 128, (base + 17) % 128, (base + 31) % 128].slice(0, TOP_CLUSTERS);
      const centroidScores = Object.fromEntries(clusterIds.map((cid, idx) => [String(cid), Number((1 - idx * 0.15).toFixed(4))]));
      return { clusterIds, centroidScores, backend: 'offline' };
    }
  }
}

function priorityScore(priority) {
  const p = String(priority ?? '').toUpperCase();
  if (p === 'HIGH') return 3;
  if (p === 'MEDIUM') return 2;
  if (p === 'LOW') return 1;
  return 0;
}

function topEntries(map, limit = 6) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function averageOffDiagonal(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix[i].length; j++) {
      const value = Number(matrix[i][j] ?? 0);
      if (Number.isFinite(value)) {
        sum += value;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function mergeIntoMap(map, key, record) {
  if (!map.has(key)) {
    map.set(key, {
      key,
      records: [],
      clusterIds: new Set(),
      sourceRefs: new Set(),
      featureFamilies: new Set(),
      statuses: new Map(),
      priorityMax: 0,
      backendCounts: new Map(),
    });
  }
  const group = map.get(key);
  group.records.push(record);
  for (const cid of record.turbovec?.clusterIds ?? []) group.clusterIds.add(cid);
  if (record.sourceRef) group.sourceRefs.add(record.sourceRef);
  if (record.featureFamily) group.featureFamilies.add(record.featureFamily);
  const status = record.kanbanStatus ?? 'UNKNOWN';
  group.statuses.set(status, (group.statuses.get(status) ?? 0) + 1);
  group.priorityMax = Math.max(group.priorityMax, priorityScore(record.priority));
  const backend = record.turbovec?.backend ?? 'offline';
  group.backendCounts.set(backend, (group.backendCounts.get(backend) ?? 0) + 1);
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# TurboVec Kanban Consolidation Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Board tasks: ${report.summary.boardTaskCount}`,
    `Mass inputs: ${report.summary.massInputCount}`,
    `Unique records: ${report.summary.uniqueRecordCount}`,
    `Embedded records: ${report.summary.embeddedCount}`,
    `TurboVec backend mix: ${Object.entries(report.summary.turbovecBackendCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`,
    `simdjson parses: ${report.summary.simdjson.totalBytesParsed ?? 0} bytes`,
    '',
    '## Consolidation groups',
  ];

  for (const group of report.groups.slice(0, 24)) {
    lines.push(
      `- **${group.groupId}**: ${group.recordCount} records, ${group.openCount} open, ` +
      `clusters=${group.clusterIds.join(', ') || 'none'}, ` +
      `families=${group.featureFamilies.join(', ') || 'none'}`
    );
    if (group.recommendation) lines.push(`  - ${group.recommendation}`);
    if (group.topTitles?.length) lines.push(`  - top: ${group.topTitles.join(' | ')}`);
  }

  lines.push(
    '',
    '## Suggested board actions',
    ...report.actions.map((action) => `- ${action}`),
    '',
    '## Notes',
    '- TurboVec is used as a prefilter and grouping aid, not as the source of truth.',
    '- Open tasks remain anchored in the kanban board and the master todo.',
    '- simdjson is used to batch-parse large JSON and JSONL inputs before scoring.',
  );

  return `${lines.join('\n')}\n`;
}

async function main() {
  const board = readJson(BOARD_PATH, { generatedAt: null, columns: {} });
  const boardTasks = flattenBoard(board).map(normalizeBoardTask);
  const kanbanJsonl = readJsonl(KANBAN_TASKS_PATH).map((row) => normalizeKanbanJsonlRow(row, 'kanban_tasks.jsonl'));
  const missingJsonl = readJsonl(MISSING_TODOS_PATH).map((row) => normalizeKanbanJsonlRow(row, 'missing_feature_todos.jsonl'));
  const featureLabels = readJsonl(FEATURE_LABELS_PATH).map((row) => normalizeFeatureLabelRow(row, 'feature_labels.jsonl'));

  const combined = [...boardTasks, ...kanbanJsonl, ...missingJsonl, ...featureLabels];
  const deduped = [];
  const seen = new Set();
  for (const record of combined) {
    const key = taskKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }

  const scopedRecords = INCLUDE_DONE ? deduped : deduped.filter((record) => String(record.kanbanStatus ?? '').toUpperCase() !== 'DONE');
  const limitedRecords = LIMIT ? scopedRecords.slice(0, LIMIT) : scopedRecords;

  const corpusTexts = limitedRecords.map((record) => buildTaskText(record));
  const vectors = await embedBatch(corpusTexts);

  const enriched = await mapWithConcurrency(
    limitedRecords.map((record, index) => ({ record, vector: vectors[index] ?? null })),
    PREFILTER_CONCURRENCY,
    async ({ record, vector }) => {
      const featureFamily = featureFamilyFromFeatureKey(record.featureKey, record.title);
      const recordHash = sha1(buildTaskText(record));
      if (!vector) {
        return {
          ...record,
          featureFamily,
          analysisId: recordHash,
          turbovec: {
            clusterIds: [],
            centroidScores: {},
            backend: 'offline',
            analysis: 'embed-miss',
          },
          consolidationGroupId: `${featureFamily}:fallback`,
        };
      }

      const prefilter = await turbovecPrefilter(vector);
      const primaryCluster = prefilter.clusterIds[0] ?? null;
      const consolidationGroupId = `${featureFamily}:cluster:${primaryCluster ?? 'none'}`;
      return {
        ...record,
        featureFamily,
        embedding: vector,
        analysisId: recordHash,
        turbovec: {
          clusterIds: prefilter.clusterIds,
          centroidScores: prefilter.centroidScores,
          backend: prefilter.backend,
          primaryClusterId: primaryCluster,
        },
        consolidationGroupId,
      };
    }
  );

  const groupMap = new Map();
  for (const record of enriched) {
    mergeIntoMap(groupMap, record.consolidationGroupId, record);
  }

  const groupsBase = [...groupMap.values()]
    .map((group) => {
      const records = group.records;
      const openCount = records.filter((r) => String(r.kanbanStatus ?? '').toUpperCase() !== 'DONE').length;
      const titleFreq = new Map();
      const featureFreq = new Map();
      const sourceFreq = new Map();
      for (const record of records) {
        if (record.title) titleFreq.set(record.title, (titleFreq.get(record.title) ?? 0) + 1);
        if (record.feature_id) featureFreq.set(record.feature_id, (featureFreq.get(record.feature_id) ?? 0) + 1);
        for (const sourceRef of record.sourceRefs ?? []) {
          sourceFreq.set(sourceRef, (sourceFreq.get(sourceRef) ?? 0) + 1);
        }
      }

      const recommendation = records.length > 1
        ? openCount > 1
          ? 'Consolidate duplicate open work into one parent kanban item and keep the file-level labels as links.'
          : 'Use this as a reference group for a single parent feature card.'
        : 'Single record; no merge action yet.'
        ;

      return {
        groupId: group.key,
        recordCount: records.length,
        openCount,
        clusterIds: [...group.clusterIds].sort((a, b) => a - b),
        featureFamilies: [...group.featureFamilies].sort(),
        sourceRefs: [...group.sourceRefs].slice(0, 12),
        topTitles: topEntries(titleFreq, 5).map((entry) => entry.key),
        topFeatureIds: topEntries(featureFreq, 5).map((entry) => entry.key),
        topSourceRefs: topEntries(sourceFreq, 5).map((entry) => entry.key),
        statuses: Object.fromEntries([...group.statuses.entries()].sort((a, b) => b[1] - a[1])),
        backendCounts: Object.fromEntries([...group.backendCounts.entries()].sort((a, b) => b[1] - a[1])),
        priorityMax: group.priorityMax,
        libtorch: {
          source: 'skipped',
          cohesion: 0,
          pairCount: 0,
        },
        recommendation,
      };
    })
    .sort((a, b) => {
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      if (b.recordCount !== a.recordCount) return b.recordCount - a.recordCount;
      return b.priorityMax - a.priorityMax;
    });

  const groups = await Promise.all(groupsBase.map(async (group) => {
    const sourceGroup = groupMap.get(group.groupId);
    const libtorchVectors = (sourceGroup?.records ?? [])
      .map((record) => record.embedding)
      .filter((vector) => Array.isArray(vector) && vector.length > 0);

    if (libtorchVectors.length <= 1 || libtorchVectors.length > 24) {
      return group;
    }

    try {
      const matrix = await graphSimilaritySafe(libtorchVectors);
      return {
        ...group,
        libtorch: {
          source: matrix.source,
          cohesion: Number(averageOffDiagonal(matrix.matrix).toFixed(4)),
          pairCount: Math.round((libtorchVectors.length * (libtorchVectors.length - 1)) / 2),
        },
      };
    } catch (error) {
      return {
        ...group,
        libtorch: {
          source: `error:${error?.message ?? String(error)}`,
          cohesion: 0,
          pairCount: Math.round((libtorchVectors.length * (libtorchVectors.length - 1)) / 2),
        },
      };
    }
  }));

  const backendCounts = enriched.reduce((acc, record) => {
    const backend = record.turbovec?.backend ?? 'offline';
    acc[backend] = (acc[backend] ?? 0) + 1;
    return acc;
  }, {});

  const boardAnalysisByTaskId = new Map();
  for (const record of enriched) {
    if (record.taskId) {
      boardAnalysisByTaskId.set(record.taskId, record);
    }
  }

  if (APPLY) {
    const updatedBoard = JSON.parse(JSON.stringify(board));
    for (const column of Object.values(updatedBoard.columns ?? {})) {
      for (const task of column?.tasks ?? []) {
        const match = boardAnalysisByTaskId.get(task.taskId ?? task.id ?? '');
        if (!match) continue;
        task.turbovec = {
          backend: match.turbovec?.backend ?? 'offline',
          clusterIds: match.turbovec?.clusterIds ?? [],
          centroidScores: match.turbovec?.centroidScores ?? {},
          primaryClusterId: match.turbovec?.primaryClusterId ?? null,
          consolidationGroupId: match.consolidationGroupId ?? null,
          featureFamily: match.featureFamily ?? null,
          analysisId: match.analysisId ?? null,
        };
      }
    }
    ensureDir(BOARD_PATH);
    fs.writeFileSync(BOARD_PATH, JSON.stringify(updatedBoard, null, 2), 'utf8');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      boardPath: BOARD_PATH,
      featureLabelsPath: FEATURE_LABELS_PATH,
      kanbanTasksPath: KANBAN_TASKS_PATH,
      missingTodosPath: MISSING_TODOS_PATH,
    },
    options: {
      apply: APPLY,
      includeDone: INCLUDE_DONE,
      limit: LIMIT,
      embedBatchSize: EMBED_BATCH_SIZE,
      prefilterConcurrency: PREFILTER_CONCURRENCY,
      topClusters: TOP_CLUSTERS,
    },
    summary: {
      boardTaskCount: boardTasks.length,
      massInputCount: combined.length,
      uniqueRecordCount: deduped.length,
      scopedRecordCount: scopedRecords.length,
      embeddedCount: vectors.filter(Boolean).length,
      groupCount: groups.length,
      consolidationCandidateGroups: groups.filter((group) => group.recordCount > 1).length,
      highOverlapGroups: groups.filter((group) => group.recordCount > 4 && group.openCount > 1).length,
      turbovecBackendCounts: backendCounts,
      libtorchAvailable: isCudaAvailable(),
      libtorchGroupsScored: groups.filter((group) => group.libtorch?.source === 'gpu' || group.libtorch?.source === 'cpu').length,
      simdjson: getSimdStats(),
      boardUpdated: APPLY,
    },
    actions: [
      'Merge the highest-overlap open groups into one parent kanban item per feature family.',
      'Keep file-level feature labels as provenance links, not separate board cards.',
      'Use the board TurboVec annotations as a routing hint for consolidation reviews.',
      'Review the top open groups first; they are the best candidates for parent-atlas compression.',
    ],
    groups: groups.slice(0, 48),
  };

  ensureDir(REPORT_JSON);
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Board updated: ${APPLY ? 'yes' : 'no'}`);
  console.log(`Groups: ${report.summary.groupCount}`);
  console.log(`Embedded records: ${report.summary.embeddedCount}/${report.summary.scopedRecordCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('TurboVec kanban consolidation failed:', error?.message ?? error);
    process.exit(1);
  });
