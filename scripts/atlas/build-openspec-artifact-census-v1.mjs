#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultOutput = resolve(root, 'docs/reports/openspec-artifact-census-v1.json');
const reportLimitBytes = 10_000_000;
const mutationFlags = {
  taskLedgerWrites: false,
  archiveWrites: false,
  cacheWrites: false,
  redisWrites: false,
  qdrantWrites: false,
  postgresWrites: false,
  seaweedfsWrites: false,
};

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    const match = /^--(workboard|output)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unexpected argument: ${arg}`);
    parsed[match[1]] = match[2];
  }
  if (!parsed.workboard) throw new Error('Required argument: --workboard=<fresh-workboard.json>');
  return parsed;
}

function repositoryPath(value) {
  const normalized = value.replace(/[\\/]/g, sep);
  const path = resolve(root, normalized);
  const rel = relative(root, path);
  if (rel.startsWith(`..${sep}`) || rel === '..' || resolve(path) === root) {
    throw new Error(`Path is outside the repository: ${value}`);
  }
  return path;
}

function verifyTaskHashes(sourceFileHashes) {
  const mismatches = [];
  const entries = Object.entries(sourceFileHashes ?? {}).sort(([left], [right]) => left.localeCompare(right));
  for (const [source, expected] of entries) {
    const path = repositoryPath(source);
    if (!existsSync(path) || !statSync(path).isFile()) {
      mismatches.push({ source, reason: 'MISSING' });
      continue;
    }
    const actual = hash(readFileSync(path));
    if (actual !== expected) mismatches.push({ source, reason: 'CHECKSUM_MISMATCH' });
  }
  return { entries, mismatches };
}

function enumerateReportFiles() {
  const reportsRoot = resolve(root, 'docs/reports');
  const files = new Map();
  const excludedNames = new Set([
    'openspec-artifact-census-v1.json',
    'openspec-evidence-disposition-v1.json',
    'openspec-evidence-disposition-20261003.md',
  ]);
  const visit = (directory, includeAllFiles) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (includeAllFiles) visit(absolute, true);
        continue;
      }
      if (!entry.isFile() || excludedNames.has(entry.name)) continue;
      const isTopLevelOpenSpecReport = directory === reportsRoot
        && /^openspec-/i.test(entry.name)
        && /\.(?:json|jsonl|ndjson|md|ya?ml)$/i.test(entry.name);
      if (!includeAllFiles && !isTopLevelOpenSpecReport) continue;
      files.set(absolute, statSync(absolute).size);
    }
  };
  visit(resolve(reportsRoot, 'openspec-evidence'), true);
  visit(reportsRoot, false);
  return [...files].sort(([left], [right]) => left.localeCompare(right));
}

export function taskCounts(workboard) {
  const rows = Array.isArray(workboard.taskInventory) ? workboard.taskInventory : Array.isArray(workboard.tasks) ? workboard.tasks : [];
  return {
    current: workboard.summary?.actionableTasks ?? 0,
    waiting: workboard.summary?.waitingTasks ?? 0,
    checked: workboard.summary?.completedTasks ?? 0,
    superseded: 0,
    supersessionReviewCandidates: workboard.summary?.supersededTasks ?? 0,
    reviewRequired: rows.filter((row) => row.gateState === 'REVIEW_REQUIRED').length,
    staleOrMissingControllerEvidence: workboard.controllerEvidence?.staleOrMissingTaskCount ?? null,
    total: workboard.summary?.totalTasks ?? rows.length,
  };
}

function getHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function loadWorkboard(workboardArg) {
  if (workboardArg !== 'fresh') {
    const workboardPath = resolve(workboardArg);
    if (!existsSync(workboardPath)) throw new Error(`Workboard not found: ${workboardPath}`);
    return JSON.parse(readFileSync(workboardPath, 'utf8'));
  }
  const builderPath = resolve(root, 'scripts/atlas/build-openspec-workboard-v1.mjs');
  const result = spawnSync(process.execPath, [builderPath, '--task-snapshot-stdout'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Fresh Workboard build failed: ${result.stderr.trim()}`);
  const snapshot = JSON.parse(result.stdout);
  return {
    ...snapshot,
    schema: 'atlas.openspec.workboard.v1',
    taskInventory: snapshot.tasks,
  };
}

export function buildCensus(workboard, reportFiles, sourcePopulationChecksum, head) {
  const bytesLocal = reportFiles.reduce((sum, [, size]) => sum + size, 0);
  const reportCount = reportFiles.length;
  const controllerAt = workboard.controllerEvidence?.generatedAt ?? null;
  const controllerStale = Boolean(controllerAt && Date.parse(controllerAt) < Date.parse(workboard.generatedAt));
  return {
    schema: 'atlas.openspec-artifact-census.v1',
    generatedAt: new Date().toISOString(),
    workspaceRevision: head,
    sourceWorkboard: {
      schema: workboard.schema ?? null,
      generatedAt: workboard.generatedAt ?? null,
      source: workboard.source ?? null,
      taskPopulationChecksum: sourcePopulationChecksum,
      sourceTaskFileCount: Object.keys(workboard.sourceFileHashes ?? {}).length,
      checksumValidation: 'MATCHED_CURRENT_TASK_FILES',
      controllerEvidenceGeneratedAt: controllerAt,
      controllerEvidenceFreshness: controllerStale ? 'STALE' : controllerAt ? 'NOT_STALE_BY_TIMESTAMP' : 'MISSING',
    },
    tasks: taskCounts(workboard),
    taskCountNotes: {
      current: 'Existing Workboard actionable count; advisory, not task authority.',
      checked: 'Checkbox claims only; not proof of completion.',
      superseded: 'Zero confirmed in this census; heuristic matches remain review candidates.',
      reviewRequired: 'Count of rows labeled REVIEW_REQUIRED by the Workboard projection; may overlap other counts.',
    },
    reports: {
      hot: 0,
      warm: 0,
      coldCandidate: 0,
      reviewRequired: reportCount,
      filesInventoriedByMetadata: reportCount,
      eligibility: 'UNASSESSED_RETAIN_LOCAL',
      classificationRequirements: [
        'current references',
        'replay requirement',
        'sensitivity',
        'canonical/source status',
        'reviewed supersession',
      ],
    },
    bytes: {
      local: bytesLocal,
      archiveCandidate: 0,
      measurement: 'Filesystem metadata only; report contents were not read.',
    },
    retrieval: {
      defaults: ['CURRENT', 'WAITING', 'REVIEW_REQUIRED'],
      historyOnly: ['SUPERSEDED', 'HISTORICAL'],
      enabled: false,
    },
    writesPerformed: false,
    outputArtifactWritten: true,
    mutationFlags,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const workboard = loadWorkboard(args.workboard);
  const { entries, mismatches } = verifyTaskHashes(workboard.sourceFileHashes);
  if (mismatches.length || entries.length === 0) {
    throw new Error(`Task-source hash validation failed: ${JSON.stringify(mismatches.length ? mismatches.slice(0, 20) : [{ reason: 'EMPTY_SOURCE_HASHES' }])}`);
  }
  const taskPopulationChecksum = hash(JSON.stringify(entries));
  const reportFiles = enumerateReportFiles();
  const census = buildCensus(workboard, reportFiles, taskPopulationChecksum, getHead());
  const outputPath = repositoryPath(args.output ?? relative(root, defaultOutput));
  const serialized = `${JSON.stringify(census, null, 2)}\n`;
  const outputBytes = Buffer.byteLength(serialized);
  if (outputBytes > reportLimitBytes) throw new Error(`Census exceeds ${reportLimitBytes} bytes: ${outputBytes}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, 'utf8');
  process.stdout.write(`OPENSPEC_ARTIFACT_CENSUS_WRITTEN tasks=${census.tasks.total} reports=${census.reports.filesInventoriedByMetadata} bytes=${outputBytes} task_hashes=${entries.length} writes=false\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
