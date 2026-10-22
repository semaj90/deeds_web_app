#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';
import Ajv from 'ajv';
import { parse as parseYaml } from 'yaml';
import { resolveOkfDevPublishedCorpusV1 } from '../../scripts/docs-atlas/lib/okf-dev-publication-v1.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const args = process.argv.slice(2);

export const SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY = Object.freeze([
  { name: 'classify_intent', effect: 'LOCAL_PURE', decision: 'ALLOW' },
  { name: 'build_agentic_rag_context', effect: 'LIVE_RETRIEVAL_UNADMITTED', decision: 'EXCLUDE' },
  { name: 'build_recommendation', effect: 'LOCAL_PURE', decision: 'ALLOW' },
  { name: 'record_outcome', effect: 'LOCAL_AND_NEO4J_WRITES', decision: 'DENY' },
  { name: 'find_dependencies', effect: 'READ_ONLY_BOUNDED_GRAPH_LOOKUP', decision: 'ALLOW' },
  { name: 'trace_database', effect: 'READ_ONLY_UNBOUNDED_GRAPH_LOOKUP', decision: 'EXCLUDE' },
  { name: 'trace_tool_chain', effect: 'READ_ONLY_UNBOUNDED_GRAPH_LOOKUP', decision: 'EXCLUDE' },
  { name: 'find_source_refs', effect: 'READ_ONLY_BOUNDED_PACKET_AND_GRAPH_LOOKUP', decision: 'ALLOW' },
  { name: 'find_feature', effect: 'READ_ONLY_UNBOUNDED_GRAPH_LOOKUP', decision: 'EXCLUDE' },
  { name: 'find_route', effect: 'READ_ONLY_UNBOUNDED_GRAPH_LOOKUP', decision: 'EXCLUDE' },
]);

function option(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function resolveTsconfig(configPath = 'tsconfig.json', { root = frontendRoot } = {}) {
  const absolutePath = path.resolve(root, configPath);
  const relativePath = path.relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    if (relativePath !== 'tsconfig.json') throw new Error('TSCONFIG_PATH_MUST_BE_INSIDE_FRONTEND');
  }
  if (lstatSync(absolutePath).isSymbolicLink() || !statSync(absolutePath).isFile()) {
    throw new Error('TSCONFIG_MUST_BE_A_REGULAR_FILE');
  }
  const realRoot = realpathSync(root);
  const realPath = realpathSync(absolutePath);
  const realRelativePath = path.relative(realRoot, realPath);
  if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
    throw new Error('TSCONFIG_PATH_MUST_BE_INSIDE_FRONTEND');
  }
  const bytes = readFileSync(realPath);
  return {
    path: relativePath.replace(/\\/g, '/') || 'tsconfig.json',
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function parseMachineDiagnostic(line) {
  const match = line.match(/^(\d+)\s+(ERROR|WARNING)\s+("(?:\\.|[^"\\])*")\s+(\d+):(\d+)\s+("(?:\\.|[^"\\])*")\s*$/);
  if (!match) return null;

  try {
    const file = JSON.parse(match[3]).replace(/\\/g, '/');
    const message = JSON.parse(match[6]);
    const lineNumber = Number(match[4]);
    const column = Number(match[5]);
    const severity = match[2].toLowerCase();
    const code = message.match(/\bTS\d{4}\b/)?.[0] ?? null;
    const fingerprint = createHash('sha256')
      .update(`${severity}\n${code ?? ''}\n${file}\n${lineNumber}:${column}\n${message.replace(/\s+/g, ' ').trim()}`)
      .digest('hex');

    return {
      timestamp: new Date(Number(match[1])).toISOString(),
      severity,
      code,
      file,
      line: lineNumber,
      column,
      message,
      fingerprint: `sha256:${fingerprint}`,
    };
  } catch {
    return null;
  }
}

function summarizeDiagnostics(diagnostics) {
  const bySeverity = { error: 0, warning: 0 };
  const byFile = new Map();
  const byCode = new Map();
  const fingerprints = new Set();

  for (const diagnostic of diagnostics) {
    bySeverity[diagnostic.severity] = (bySeverity[diagnostic.severity] ?? 0) + 1;
    fingerprints.add(diagnostic.fingerprint);
    byFile.set(diagnostic.file, (byFile.get(diagnostic.file) ?? 0) + 1);
    const codeKey = diagnostic.code ?? 'NO_CODE';
    byCode.set(codeKey, (byCode.get(codeKey) ?? 0) + 1);
  }

  const ranked = (entries) => [...entries]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    total: diagnostics.length,
    errors: bySeverity.error,
    warnings: bySeverity.warning,
    uniqueFingerprints: fingerprints.size,
    duplicateDiagnostics: diagnostics.length - fingerprints.size,
    byCode: ranked(byCode),
    topFiles: ranked(byFile).slice(0, 50),
  };
}

function classifyDiagnostic(diagnostic) {
  const code = diagnostic.code ?? '';
  if (/^TS\d{4}$/.test(code)) {
    return { category: 'TYPECHECK', ownerHint: 'TypeScript contract or module owner', nextStep: 'Inspect the owning type and run the narrowest relevant check.' };
  }
  if (/^a11y_/.test(code)) {
    return { category: 'ACCESSIBILITY', ownerHint: 'Svelte component owner', nextStep: 'Review native semantics, accessible names, and keyboard behavior.' };
  }
  if (code === 'css_unused_selector') {
    return { category: 'CSS_REVIEW', ownerHint: 'Svelte component stylesheet owner', nextStep: 'Check dynamic classes and component boundaries before removing the selector.' };
  }
  if (code === 'props_duplicate' || code === 'attribute_duplicate') {
    return { category: 'DUPLICATE_ATTRIBUTE', ownerHint: 'Svelte component owner', nextStep: 'Inspect the duplicate prop or attribute and preserve intended binding behavior.' };
  }
  return { category: 'UNCLASSIFIED', ownerHint: 'Manual owner review', nextStep: 'Resolve the source owner and diagnostic meaning before proposing a patch.' };
}

function buildTodoList(diagnostics, { runId, gitRevision, logPath, logSha256 = null }) {
  const grouped = new Map();
  for (const diagnostic of diagnostics) {
    const existing = grouped.get(diagnostic.fingerprint);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }
    grouped.set(diagnostic.fingerprint, {
      taskId: `svelte-check:${diagnostic.fingerprint.slice('sha256:'.length, 30)}`,
      title: `${diagnostic.severity === 'error' ? 'Fix' : 'Review'} ${diagnostic.code ?? 'Svelte diagnostic'} in ${diagnostic.file}:${diagnostic.line}`,
      ...classifyDiagnostic(diagnostic),
      severity: diagnostic.severity,
      diagnosticCode: diagnostic.code,
      file: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
      message: diagnostic.message,
      fingerprint: diagnostic.fingerprint,
      diagnosticEvidence: diagnostic.logEvidence ?? null,
      sourceRevisionStatus: 'REQUIRES_CURRENT_SOURCE_REVALIDATION',
      occurrences: 1,
      status: 'PROPOSED_REVIEW_ONLY',
      mutationAllowed: false,
    });
  }

  const tasks = [...grouped.values()].sort((a, b) => a.taskId.localeCompare(b.taskId));
  const todoList = {
    schema: 'atlas.svelte-check-todo-list.v1',
    runId,
    gitRevision,
    sourceLog: logPath,
    sourceLogSha256: logSha256,
    authority: 'LOCAL_DIAGNOSTIC_PROJECTION',
    mutationAllowed: false,
    tasks,
  };
  todoList.executionDag = buildReviewDag(tasks);
  return todoList;
}

// Pretty (human) svelte-check output: `<abs path>:<line>:<col>` then `Warn: <msg>` or `Error: <msg>`,
// then `https://svelte.dev/e/<code> (svelte)`. ANSI colour codes are stripped before matching.
const PRETTY_HEADER = /^(.+?):(\d+):(\d+)$/;
const PRETTY_MESSAGE = /^(Warn|Error): (.+)$/;
const PRETTY_SUMMARY = /svelte-check found (\d+) errors? and (\d+) warnings? in \d+ files?/;
const ANSI = /\x1b\[[0-9;]*m/g;

function prettyFingerprint({ severity, code, file, line, column, message }) {
  return `sha256:${createHash('sha256')
    .update(`${severity}\n${code ?? ''}\n${file}\n${line}:${column}\n${message.replace(/\s+/g, ' ').trim()}`)
    .digest('hex')}`;
}

function normalizePrettyPath(absolute) {
  const slashed = absolute.replace(/\\/g, '/');
  const marker = '/sveltekit-frontend/';
  const at = slashed.toLowerCase().lastIndexOf(marker);
  return at === -1 ? slashed : slashed.slice(at + marker.length);
}

function parsePrettyDiagnosticAt(lines, index) {
  const header = lines[index].match(PRETTY_HEADER);
  const message = (lines[index + 1] ?? '').match(PRETTY_MESSAGE);
  if (!header || !message) return null;
  const severity = message[1] === 'Warn' ? 'warning' : 'error';
  const diagnostic = {
    timestamp: null,
    severity,
    code: null,
    file: normalizePrettyPath(header[1]),
    line: Number(header[2]),
    column: Number(header[3]),
    message: message[2],
  };
  diagnostic.fingerprint = prettyFingerprint(diagnostic);
  return diagnostic;
}

function parseSavedLog(content, { logPath, logSha256, sourceRunSummary = null, replayWorkspaceRevision = null }) {
  const lines = content.replace(ANSI, '').split(/\r?\n/);
  const diagnostics = [];
  const unmatchedLines = [];
  let pendingDiagnostic = null;
  let checkerSummary = null;
  const flush = () => {
    if (pendingDiagnostic) diagnostics.push(pendingDiagnostic);
    pendingDiagnostic = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const diagnostic = parseMachineDiagnostic(lines[index]);
    const lineSha256 = `sha256:${createHash('sha256').update(lines[index]).digest('hex')}`;
    const pretty = !diagnostic ? parsePrettyDiagnosticAt(lines, index) : null;
    if (diagnostic) {
      flush();
      pendingDiagnostic = {
        ...diagnostic,
        logEvidence: { logPath, logSha256, line: index + 1, lineSha256 },
      };
    } else if (pretty) {
      flush();
      pendingDiagnostic = {
        ...pretty,
        logEvidence: { logPath, logSha256, line: index + 1, lineSha256 },
      };
      // The message line is part of this diagnostic; the URL line is handled by the branch below.
      index += 1;
    } else if (/^https?:\/\//.test(lines[index]) && pendingDiagnostic) {
      pendingDiagnostic.documentationUrl = lines[index];
      pendingDiagnostic.documentationEvidence = { line: index + 1, lineSha256 };
      const svelteCode = lines[index].match(/\/e\/([a-z0-9_]+)\b/)?.[1];
      if (svelteCode && pendingDiagnostic.code == null) {
        pendingDiagnostic.code = svelteCode;
        pendingDiagnostic.fingerprint = prettyFingerprint(pendingDiagnostic);
      }
    } else if (PRETTY_SUMMARY.test(lines[index])) {
      flush();
      const counts = lines[index].match(PRETTY_SUMMARY);
      checkerSummary = { errors: Number(counts[1]), warnings: Number(counts[2]), line: index + 1 };
    } else {
      flush();
      if (lines[index].trim()) unmatchedLines.push({ line: index + 1, lineSha256 });
    }
  }
  flush();

  const parsedCounts = summarizeDiagnostics(diagnostics);
  const countsMatchCheckerSummary = checkerSummary
    ? checkerSummary.errors === parsedCounts.errors && checkerSummary.warnings === parsedCounts.warnings
    : null;
  const matchingSummary = sourceRunSummary && sourceRunSummary.outputs?.logSha256 === logSha256;
  const countsMatchCaptureSummary = matchingSummary && Number.isInteger(sourceRunSummary.errors) && Number.isInteger(sourceRunSummary.warnings)
    ? sourceRunSummary.errors === parsedCounts.errors && sourceRunSummary.warnings === parsedCounts.warnings
    : null;
  const acceptedExitCode = matchingSummary && [0, 1].includes(sourceRunSummary.exitCode);
  const complete = Boolean(matchingSummary && acceptedExitCode && countsMatchCheckerSummary !== false && countsMatchCaptureSummary !== false && typeof sourceRunSummary.runId === 'string' &&
    typeof sourceRunSummary.gitRevision === 'string' && sourceRunSummary.timedOut === false &&
    sourceRunSummary.interrupted === false && Number.isInteger(sourceRunSummary.exitCode));
  const sourceRunId = matchingSummary ? sourceRunSummary.runId : null;
  const sourceGitRevision = matchingSummary ? sourceRunSummary.gitRevision : null;
  const summary = {
    schema: 'atlas.svelte-check-replay.v1',
    sourceRunId,
    inputLog: logPath,
    inputLogSha256: logSha256,
    inputBytes: Buffer.byteLength(content),
    status: complete ? 'COMPLETE' : 'INCOMPLETE',
    completionEvidence: complete ? 'CHECKSUM_MATCHED_CAPTURE_SUMMARY' : 'MISSING_OR_UNMATCHED_CAPTURE_SUMMARY',
    checkerSummary,
    countsMatchCheckerSummary,
    countsMatchCaptureSummary,
    acceptedExitCode: acceptedExitCode ?? false,
    sourceGitRevision,
    replayWorkspaceRevision,
    sourceRevisionStatus: sourceGitRevision ? 'RECORDED_REQUIRES_FILE_LEVEL_REVALIDATION' : 'NOT_PROVEN',
    writesPerformed: false,
    unmatchedLineCount: unmatchedLines.length,
    unmatchedLineEvidence: unmatchedLines.slice(0, 200),
    ...summarizeDiagnostics(diagnostics),
  };
  return { summary, diagnostics, unmatchedLines };
}

function currentSourceSnapshot(file, { root = frontendRoot } = {}) {
  const normalized = file.replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    return { status: 'SOURCE_PATH_REJECTED', sourceRef: null, currentBytesSha256: null, workingTreeState: 'UNKNOWN' };
  }
  const absolutePath = path.resolve(root, normalized);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return { status: 'SOURCE_PATH_REJECTED', sourceRef: null, currentBytesSha256: null, workingTreeState: 'UNKNOWN' };
  }
  try {
    const rootRealPath = realpathSync(root);
    const sourceRealPath = realpathSync(absolutePath);
    const realRelativePath = path.relative(rootRealPath, sourceRealPath);
    if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath) || lstatSync(absolutePath).isSymbolicLink()) {
      return { status: 'SOURCE_PATH_REJECTED', sourceRef: null, currentBytesSha256: null, workingTreeState: 'UNKNOWN' };
    }
    const bytes = readFileSync(sourceRealPath);
    if (!statSync(absolutePath).isFile()) throw new Error('NOT_A_FILE');
    const gitStatus = spawnSync('git', ['status', '--porcelain', '--', relativePath.replace(/\\/g, '/')], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      status: 'CURRENT_BYTES_OBSERVED_ORIGINAL_REVISION_UNPROVEN',
      sourceRef: relativePath.replace(/\\/g, '/'),
      currentBytesSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      byteLength: bytes.length,
      workingTreeState: gitStatus.status === 0 ? (gitStatus.stdout.trim() ? 'DIRTY_OR_UNTRACKED' : 'CLEAN_AT_CURRENT_HEAD') : 'UNKNOWN',
    };
  } catch {
    return {
      status: 'CURRENT_SOURCE_UNAVAILABLE',
      sourceRef: relativePath.replace(/\\/g, '/'),
      currentBytesSha256: null,
      workingTreeState: 'UNKNOWN',
    };
  }
}

function buildKanbanPlan(todoList, { replayWorkspaceRevision = null, sourceResolver = currentSourceSnapshot } = {}) {
  const tasks = todoList.tasks.map((task) => {
    const source = sourceResolver(task.file);
    return {
      id: task.taskId,
      priority: task.severity === 'error' ? 'P1' : 'P2',
      priorityBasis: 'SEVERITY_DISPLAY_ONLY_NOT_SCHEDULER_AUTHORITY',
      label: `[${task.ownerHint}] ${task.file}:${task.line} ${task.message}`.slice(0, 200),
      gate: 'SOURCE_LINEAGE_REVIEW_REQUIRED',
      status: 'BLOCKED_LINEAGE_REVIEW_ONLY',
      origin: 'svelte_check_saved_log_replay_v1',
      source_ref: source.sourceRef ?? task.file,
      evidence_refs: [
        ...(task.diagnosticEvidence ? [`log:${task.diagnosticEvidence.logSha256}#L${task.diagnosticEvidence.line}`] : []),
        `diagnostic:${task.fingerprint}`,
      ],
      reason_codes: [task.category, task.diagnosticCode].filter(Boolean),
      blockedBy: ['RESOLVE_CANONICAL_SOURCE_ID', 'VERIFY_ORIGINAL_SOURCE_REVISION'],
      diagnosticFingerprint: task.fingerprint,
      canonicalId: null,
      sourceRevision: null,
      workspaceRevision: replayWorkspaceRevision,
      sourceEvidence: {
        status: source.status,
        currentBytesSha256: source.currentBytesSha256,
        byteLength: source.byteLength ?? null,
        workingTreeState: source.workingTreeState,
        originalDiagnosticSourceMatch: 'NOT_PROVEN',
      },
      workboardLink: { status: 'NOT_LINKED_TO_OPEN_SPEC_TASK', taskKey: null },
      suggestedOwner: task.ownerHint,
      mutationAllowed: false,
      validationCommands: [],
      acceptanceGates: ['RESOLVE_CANONICAL_SOURCE_ID', 'VERIFY_ORIGINAL_SOURCE_REVISION', 'HUMAN_APPROVAL', 'RUN_FOCUSED_VALIDATION'],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return {
    schema: 'atlas.svelte-check-daily-graphify-board-proposal.v1',
    authority: 'PROPOSAL_ONLY',
    targetBoard: 'docs/reports/atlas/atlas-kanban-tasks.json',
    sourceLog: todoList.sourceLog,
    sourceLogSha256: todoList.sourceLogSha256 ?? null,
    replayWorkspaceRevision,
    canonicalIdentityResolved: false,
    scheduled: false,
    publishedToBoard: false,
    mutationAllowed: false,
    tasks,
  };
}

function buildReplayProposal(parsed, { runId, logPath, replayWorkspaceRevision = null, sourceResolver = currentSourceSnapshot } = {}) {
  const eligibleDiagnostics = parsed.summary.status === 'COMPLETE' ? parsed.diagnostics : [];
  const todoList = buildTodoList(eligibleDiagnostics, {
    runId: runId ?? parsed.summary.sourceRunId ?? 'incomplete-replay',
    gitRevision: parsed.summary.sourceGitRevision,
    logPath: logPath ?? parsed.summary.inputLog,
    logSha256: parsed.summary.inputLogSha256,
  });
  todoList.replay = {
    status: parsed.summary.status,
    inputLogSha256: parsed.summary.inputLogSha256,
    extractedObservationCount: parsed.diagnostics.length,
    promotableDiagnosticCount: eligibleDiagnostics.length,
    sourceRevisionStatus: parsed.summary.sourceRevisionStatus,
    writesPerformed: false,
  };
  todoList.kanbanPlan = buildKanbanPlan(todoList, { replayWorkspaceRevision, sourceResolver });
  return todoList;
}

function stableId(prefix, value) {
  return `${prefix}:${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}

function buildReviewDag(tasks) {
  const sourceNodeId = 'svelte-check:resolve-source-context';
  const reviewNodes = tasks.slice(0, 100).map((task) => ({
    nodeId: stableId('svelte-check:review', task.taskId),
    kind: 'REVIEW_DIAGNOSTIC',
    taskId: task.taskId,
    dependsOn: [sourceNodeId],
    status: 'PROPOSED_REVIEW_ONLY',
    mutationAllowed: false,
  }));
  const nodes = tasks.length ? [
    { nodeId: sourceNodeId, kind: 'RESOLVE_EXISTING_EVIDENCE', status: 'WAITING_FOR_OPERATOR', mutationAllowed: false },
    ...reviewNodes,
    {
      nodeId: 'svelte-check:scoped-validation-after-approval',
      kind: 'VALIDATE_AFTER_OPERATOR_APPROVAL',
      dependsOn: reviewNodes.map((node) => node.nodeId),
      status: 'BLOCKED_UNTIL_APPROVAL_AND_PATCH',
      mutationAllowed: false,
    },
  ] : [];
  return {
    schema: 'atlas.svelte-check-review-dag.v1',
    authority: 'PROPOSAL_ONLY',
    scheduled: false,
    truncated: tasks.length > reviewNodes.length,
    nodeCount: nodes.length,
    nodes,
  };
}

function diagnosticTerms(task) {
  return new Set(`${task.category} ${task.diagnosticCode ?? ''} ${task.file} ${task.message}`
    .toLowerCase().replace(/[^a-z0-9_./-]+/g, ' ').split(/[\s_./-]+/).filter((term) => term.length > 2));
}

function loadValidatedOkfVocabulary(root = repoRoot) {
  const yamlPath = path.join(root, '.okf', 'corpora', 'keyword-corpus.yaml');
  const schemaPath = path.join(root, '.okf', 'corpora', 'keyword-corpus.schema.json');
  const vocabulary = parseYaml(readFileSync(yamlPath, 'utf8'));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const validator = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
  if (!validator(vocabulary)) throw new Error('OKF_VOCABULARY_SCHEMA_INVALID');
  if (vocabulary.canonical_authority !== false || vocabulary.indexing?.searchable !== false) {
    throw new Error('OKF_VOCABULARY_MUST_REMAIN_REFERENCE_ONLY');
  }
  return vocabulary;
}

function matchOkfHints(task, vocabulary, maxHints = 3) {
  const terms = diagnosticTerms(task);
  return vocabulary.entries.map((entry) => {
    const matchedTerms = entry.terms.flatMap((term) => {
      const words = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return words.some((word) => terms.has(word)) ? [term] : [];
    });
    return { entry, matchedTerms: [...new Set(matchedTerms)] };
  }).filter((match) => match.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || a.entry.id.localeCompare(b.entry.id))
    .slice(0, maxHints)
    .map(({ entry, matchedTerms }) => ({
      conceptId: entry.id,
      matchedTerms,
      definition: entry.definition,
      sourceRefs: entry.source_refs,
      evidenceStatus: entry.evidence_status,
      authority: 'REFERENCE_ONLY',
      searchable: false,
    }));
}

function matchPublishedDocs(task, corpus, manifest, { maxDocs = 3, maxCrawlSources = 3 } = {}) {
  const terms = diagnosticTerms(task);
  const scored = corpus.map((entry) => {
    const tags = Array.isArray(entry.focus_tags) ? entry.focus_tags : [];
    const matchedTags = tags.filter((tag) => tag.toLowerCase().split(/[^a-z0-9]+/).some((word) => terms.has(word)));
    const domainHit = entry.domain_class === task.category.toLowerCase();
    return { entry, matchedTags, score: matchedTags.length + Number(domainHit) };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.source_ref.localeCompare(b.entry.source_ref));
  const manifestSources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const crawlCandidates = manifestSources.map((source) => {
    const matchedTags = (source.focus_tags ?? []).filter((tag) => terms.has(tag.toLowerCase().replace(/[^a-z0-9]+/g, '_')) ||
      tag.toLowerCase().split(/[^a-z0-9]+/).some((word) => terms.has(word)));
    return { source, matchedTags };
  }).filter((item) => item.matchedTags.length > 0)
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length || a.source.source_id.localeCompare(b.source.source_id))
    .slice(0, maxCrawlSources)
    .map(({ source, matchedTags }) => ({
      sourceId: source.source_id,
      matchedTags,
      urls: (source.pages ?? []).slice(0, 3),
      status: 'ALLOWLIST_CANDIDATE_NOT_FETCHED',
      fetchTriggered: false,
    }));
  return {
    publishedCorpus: scored.slice(0, maxDocs).map(({ entry, matchedTags, score }) => ({
      sourceId: entry.source_id,
      sourceRef: entry.source_ref,
      title: entry.title,
      url: entry.url,
      contentHash: entry.content_hash,
      focusTags: entry.focus_tags,
      matchedTags,
      score,
      authority: 'REFERENCE_ONLY',
      pageBytesReopened: false,
    })),
    crawlCandidates,
  };
}

function enrichWithOkfAndDocs(todoList, { root = repoRoot } = {}) {
  const result = {
    schema: 'atlas.svelte-check-okf-enrichment.v1',
    authority: 'REFERENCE_ONLY',
    canonicalAuthority: false,
    fetchTriggered: false,
    indexingTriggered: false,
    status: 'PARTIAL',
    tasks: {},
  };
  try {
    const vocabulary = loadValidatedOkfVocabulary(root);
    const devRoot = path.join(root, 'docs', '.okf', 'dev');
    const publication = resolveOkfDevPublishedCorpusV1(devRoot);
    const manifest = JSON.parse(readFileSync(path.join(devRoot, 'manifest.json'), 'utf8'));
    const corpus = publication
      ? readFileSync(publication.corpusPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : [];
    for (const task of todoList.tasks) {
      result.tasks[task.taskId] = {
        lutHints: matchOkfHints(task, vocabulary),
        documentation: matchPublishedDocs(task, corpus, manifest),
      };
    }
    result.status = publication ? 'CHECKSUM_VERIFIED_CORPUS_REFERENCES' : 'VOCABULARY_VALIDATED_CORPUS_UNAVAILABLE';
    result.vocabulary = {
      schema: vocabulary.schema,
      entryCount: vocabulary.entries.length,
      authority: 'REFERENCE_ONLY',
      searchable: false,
    };
    result.documentationCorpus = publication ? {
      generationId: publication.pointer.run_id,
      manifestChecksum: publication.pointer.generation_manifest_checksum,
      corpusEntries: corpus.length,
      checksumValidated: true,
      pageByteReadbackPerformed: false,
    } : null;
  } catch (error) {
    result.status = 'UNAVAILABLE';
    result.reason = String(error?.message ?? error).slice(0, 300);
  }
  todoList.okfEnrichment = result;
  return todoList;
}

function buildWorkboardContext(todoList, { root = repoRoot, now = Date.now() } = {}) {
  const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
  const ageDays = (timestamp) => {
    const parsed = Date.parse(timestamp ?? '');
    return Number.isFinite(parsed) ? Math.max(0, (now - parsed) / 86400000) : null;
  };
  const report = {
    schema: 'atlas.svelte-check-workboard-context.v1',
    authority: 'READ_ONLY_WORKBOARD_PROJECTION',
    taskStateMutation: false,
    agentDispatch: false,
    recommendations: [],
    phases: [],
    dailyGraphify: null,
    lowRank: null,
    runtimePolicy: {
      simdjson: { status: 'NOT_NEEDED_FOR_TEXT_LOG', rationale: 'The capture parses bounded machine-output lines; consider native parsing only after profiling a large JSON/JSONL bottleneck.' },
      hyperLogLog: { status: 'NOT_NEEDED', rationale: 'Exact diagnostic fingerprint deduplication is required; approximate cardinality cannot replace the TODO list.' },
      napi: { status: 'NOT_NEEDED', rationale: 'No native compute bottleneck is established for diagnostic parsing or lookup.' },
      postgres18AioBitmap: { status: 'EXISTING_PLANNER_BEHAVIOR', rationale: 'AIO/bitmap scans are PostgreSQL planner choices; do not add an application bitmap table or index for local diagnostic logs.' },
      valkeyCentroids: { status: 'DEFERRED', rationale: 'Centroid caching is not required for Svelte diagnostics and cannot confer identity or evidence authority.' },
      acePacket: { status: 'BLOCKED_PENDING_EXISTING_CONTEXTMANIFEST_READBACK', rationale: 'This helper does not create ACE packets or write Redis/Valkey; use the existing ACE owner only after candidate and manifest readback gates pass.' },
    },
  };

  try {
    const workboard = readJson('docs/reports/openspec-workboard-v1.json');
    const workboardAgeDays = ageDays(workboard.generatedAt);
    const freshActionable = workboardAgeDays != null && workboardAgeDays <= 2 && Array.isArray(workboard.actionableTasks)
      ? workboard.actionableTasks
      : [];
    const lowRank = readJson('docs/reports/low-rank-task-recommendation-v2.json');
    const lowRankAgeDays = ageDays(lowRank.generatedAt);
    const lowRankRanks = new Map((Array.isArray(lowRank.tasks) ? lowRank.tasks : [])
      .filter((item) => typeof item.id === 'string' && Number.isFinite(item.rank))
      .map((item) => [item.id, item.rank]));
    const diagnosticTermSet = new Set(todoList.tasks.flatMap((task) => [...diagnosticTerms(task)]));
    report.recommendations = freshActionable.map((task) => {
      const text = `${task.taskKey ?? ''} ${task.text ?? ''}`.toLowerCase();
      const matchedTerms = [...diagnosticTermSet].filter((term) => term.length > 3 && text.includes(term));
      return { task, matchedTerms };
    }).filter((item) => item.matchedTerms.length > 0)
      .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || String(a.task.taskKey).localeCompare(String(b.task.taskKey)))
      .slice(0, 12)
      .map(({ task, matchedTerms }) => ({
        taskKey: task.taskKey,
        change: task.change,
        source: task.source,
        line: task.line,
        title: String(task.text ?? '').slice(0, 240),
        executionState: task.executionState ?? 'UNKNOWN',
        matchedTerms,
        existingLowRank: lowRankRanks.has(task.taskKey) ? {
          rank: lowRankRanks.get(task.taskKey),
          status: lowRankAgeDays != null && lowRankAgeDays <= 7 && lowRank.advisoryOnly === true && lowRank.canonicalAuthority === false
            ? 'ADVISORY_TIEBREAK_ONLY'
            : 'STALE_ADVISORY_NOT_USED',
        } : null,
        mutationAllowed: false,
      }));
    report.phases = (Array.isArray(workboard.executionSteps) ? workboard.executionSteps : []).map((step) => ({
      id: step.id,
      wave: step.wave,
      title: step.title,
      dependsOn: step.dependsOn ?? [],
      gate: step.gate ?? null,
      status: 'REFERENCE_ONLY',
    }));
    const graphify = readJson('docs/graph/kanban-board.json');
    const graphAgeDays = ageDays(graphify.generatedAt);
    report.dailyGraphify = {
      path: 'docs/graph/kanban-board.json',
      generatedAt: graphify.generatedAt ?? null,
      ageDays: graphAgeDays == null ? null : Number(graphAgeDays.toFixed(2)),
      taskCount: Number.isFinite(graphify.totalTasks) ? graphify.totalTasks : null,
      status: graphAgeDays != null && graphAgeDays > 14 ? 'STALE_SNAPSHOT_NOT_USED_FOR_SCHEDULING' : 'BOUNDED_REFERENCE_ONLY',
      refreshTriggered: false,
    };
    report.lowRank = {
      path: 'docs/reports/low-rank-task-recommendation-v2.json',
      schema: lowRank.schema ?? null,
      generatedAt: lowRank.generatedAt ?? null,
      ageDays: lowRankAgeDays == null ? null : Number(lowRankAgeDays.toFixed(2)),
      taskCount: lowRankRanks.size,
      advisoryOnly: lowRank.advisoryOnly === true && lowRank.canonicalAuthority === false,
      status: lowRankAgeDays != null && lowRankAgeDays > 7 ? 'STALE_ADVISORY_NOT_USED' : 'ADVISORY_ONLY',
      scoreMergedIntoDiagnosticRanking: false,
    };
    report.workboard = {
      path: 'docs/reports/openspec-workboard-v1.json',
      generatedAt: workboard.generatedAt ?? null,
      ageDays: workboardAgeDays == null ? null : Number(workboardAgeDays.toFixed(2)),
      status: workboardAgeDays != null && workboardAgeDays <= 2 ? 'CURRENT_REPORT_READ_ONLY' : 'STALE_REPORT_NOT_USED_FOR_SCHEDULING',
      actionableTaskCount: Array.isArray(workboard.actionableTasks) ? workboard.actionableTasks.length : 0,
    };
  } catch (error) {
    report.status = 'PARTIAL';
    report.reason = String(error?.message ?? error).slice(0, 300);
  }
  todoList.workboardContext = report;
  return todoList;
}

function parseToolResult(result) {
  if (result?.isError) throw new Error('MCP tool returned an error');
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function enrichTodoList(todoList, callTool, {
  maxFiles = 8,
  maxConcurrent = 4,
  captureStatus = 'UNVERIFIED',
  sourceGitRevision = todoList.gitRevision ?? null,
  sourceResolver = currentSourceSnapshot,
  currentRevisionResolver = gitRevision,
} = {}) {
  const fileTargets = [...new Set(todoList.tasks.map((task) => task.file))].slice(0, maxFiles);
  const enrichment = {
    schema: 'atlas.svelte-check-mcp-enrichment.v1',
    authority: 'ADVISORY_ONLY',
    writesPerformed: false,
    status: 'BLOCKED',
    captureStatus,
    sourceEvidence: {},
    toolInventory: null,
    aceCache: {
      status: 'BLOCKED_CONTEXTMANIFEST_ADMISSION_REQUIRED',
      writesPerformed: false,
    },
    tools: {},
  };
  if (captureStatus !== 'COMPLETE') {
    enrichment.reason = 'MCP_ENRICHMENT_REQUIRES_COMPLETE_CAPTURE_RECEIPT';
    todoList.enrichment = enrichment;
    return todoList;
  }
  if (todoList.tasks.length === 0) {
    enrichment.reason = 'NO_DIAGNOSTIC_TASKS_TO_ENRICH';
    todoList.enrichment = enrichment;
    return todoList;
  }

  const currentRevision = currentRevisionResolver();
  enrichment.sourceEvidence = Object.fromEntries(fileTargets.map((file) => {
    const source = sourceResolver(file);
    const sameWorkspaceRevision = Boolean(sourceGitRevision && currentRevision && sourceGitRevision === currentRevision);
    const cleanFile = source.workingTreeState === 'CLEAN_AT_CURRENT_HEAD';
    return [file, {
      status: sameWorkspaceRevision && cleanFile ? 'CAPTURE_REVISION_MATCHED_CURRENT_CLEAN_FILE' : 'CURRENT_SOURCE_OBSERVED_OR_ORIGINAL_REVISION_UNPROVEN',
      sourceRef: source.sourceRef,
      currentBytesSha256: source.currentBytesSha256,
      workingTreeState: source.workingTreeState,
      captureGitRevision: sourceGitRevision,
      currentGitRevision: currentRevision,
      originalDiagnosticSourceMatch: sameWorkspaceRevision && cleanFile ? 'REVISION_MATCHED' : 'NOT_PROVEN',
    }];
  }));

  const safelyCall = async (name, args) => {
    try {
      return { status: 'OK', result: parseToolResult(await callTool(name, args)) };
    } catch (error) {
      return { status: 'UNAVAILABLE', reason: String(error?.message ?? error).slice(0, 300) };
    }
  };

  const prompt = todoList.tasks.slice(0, 20).map((task) => `${task.file}:${task.line} ${task.diagnosticCode ?? task.category}: ${task.message}`).join('\n');
  enrichment.tools.classification = await safelyCall('classify_intent', {
    prompt: `Review these Svelte diagnostics and classify the repair domain:\n${prompt}`.slice(0, 6000),
    context: 'svelte-check diagnostics; read-only review only',
  });
  enrichment.tools.sourceRefs = fileTargets.length
    ? await safelyCall('find_source_refs', { refs: fileTargets })
    : { status: 'SKIPPED', reason: 'NO_DIAGNOSTIC_FILES' };
  const dependencyResults = await mapWithConcurrency(fileTargets, maxConcurrent, async (target) => [
    target,
    await safelyCall('find_dependencies', { target }),
  ]);
  enrichment.tools.dependencies = Object.fromEntries(dependencyResults);

  const classified = enrichment.tools.classification.result ?? {};
  enrichment.tools.recommendation = await safelyCall('build_recommendation', {
    intent: classified.intent ?? 'repair',
    domain: classified.domain ?? 'general',
    errorSummary: `${todoList.tasks.length} Svelte diagnostics in ${fileTargets.length} bounded file targets`,
    evidenceLines: [
      ...todoList.tasks.slice(0, 20).map((task) => `${task.file}:${task.line} ${task.diagnosticCode ?? task.category}`),
      ...Object.values(todoList.okfEnrichment?.tasks ?? {}).flatMap((item) => [
        ...item.documentation.publishedCorpus.map((doc) => `${doc.sourceRef} ${doc.contentHash}`),
        ...item.lutHints.map((hint) => `OKF reference concept ${hint.conceptId}`),
      ]).slice(0, 20),
      ...(todoList.workboardContext?.recommendations ?? []).slice(0, 8).map((task) => `${task.source}:${task.line} ${task.taskKey} ${task.executionState}`),
    ],
    patchTargets: fileTargets,
    proposedFix: 'Review grouped diagnostics and dependencies; do not apply changes automatically.',
  });
  enrichment.status = Object.values(enrichment.tools)
    .some((entry) => entry?.status === 'UNAVAILABLE' || Object.values(entry ?? {}).some((nested) => nested?.status === 'UNAVAILABLE'))
    ? 'PARTIAL'
    : 'ENRICHED_ADVISORY_ONLY';
  enrichment.repairAuthority = 'NONE_REQUIRES_SOURCE_REVIEW_AND_APPROVAL';
  enrichment.dagStatus = todoList.executionDag?.authority === 'PROPOSAL_ONLY' ? 'PROPOSAL_ONLY' : 'NOT_AVAILABLE';
  todoList.enrichment = enrichment;
  return todoList;
}

function createAtlasMcpClient({ serverPath, timeoutMs = 12000, spawnImpl = spawn, env = process.env } = {}) {
  const child = spawnImpl(process.execPath, [serverPath], {
    cwd: frontendRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env,
  });
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  let closed = false;
  let verifiedTools = new Set();
  const rejectPending = (error) => {
    closed = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };
  reader.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message ?? 'MCP request failed'));
    else entry.resolve(message.result);
  });
  child.once('error', rejectPending);
  child.once('close', (code) => rejectPending(new Error(`Atlas MCP closed (${code ?? 'no exit code'})`)));
  child.stderr.on('data', () => {});

  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('Atlas MCP process is unavailable'));
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Atlas MCP ${method} timed out`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (error) => {
      if (!error) return;
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    });
  });

  return {
    async initialize() {
      const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'svelte-check-capture', version: '1.0.0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const listing = await request('tools/list');
      if (!Array.isArray(listing?.tools)) throw new Error('MCP_TOOL_REGISTRY_INVALID');
      const names = listing.tools.map((tool) => tool?.name).filter((name) => typeof name === 'string');
      const expectedNames = SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY.map((tool) => tool.name);
      const unknown = names.filter((name) => !expectedNames.includes(name));
      const missing = expectedNames.filter((name) => !names.includes(name));
      if (unknown.length || missing.length || names.length !== new Set(names).size) {
        throw new Error(`MCP_TOOL_REGISTRY_DRIFT:${JSON.stringify({ unknown, missing })}`);
      }
      const toolByName = new Map(listing.tools.map((tool) => [tool.name, tool]));
      const allowed = SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY.filter((tool) => tool.decision === 'ALLOW');
      for (const policy of allowed) {
        const schema = toolByName.get(policy.name)?.inputSchema;
        if (!schema || schema.type !== 'object' || schema.additionalProperties !== false) {
          throw new Error(`MCP_ALLOWED_TOOL_SCHEMA_UNSAFE:${policy.name}`);
        }
      }
      verifiedTools = new Set(allowed.map((tool) => tool.name));
      return {
        serverInfo: initialized?.serverInfo ?? null,
        registeredToolNames: names,
        policy: SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY,
        registryStatus: 'EXACT_REGISTRY_MATCH_AND_ALLOWED_SCHEMAS_VERIFIED',
      };
    },
    async callTool(name, args) {
      if (!verifiedTools.has(name)) throw new Error(`MCP tool not allowed or not verified: ${name}`);
      return request('tools/call', { name, arguments: args });
    },
    close() {
      child.stdin.end();
      setTimeout(() => { if (!closed) child.kill(); }, 1000).unref();
    },
  };
}

function gitRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: frontendRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function main() {
  if (args.includes('--help')) {
    process.stdout.write('Usage: npm run check:logged [-- --tsconfig <path> --output-dir <path> --timeout-ms <ms> --enhance --mcp-enrich]\n       npm run check:replay -- <saved-log.txt> [--enhance --mcp-enrich]\n');
    return 0;
  }

  const replayIndex = args.indexOf('--replay-log');
  if (replayIndex !== -1) {
    const requestedPath = args[replayIndex + 1];
    if (!requestedPath) throw new Error('--replay-log requires a path');
    const logPath = path.resolve(repoRoot, requestedPath);
    const relativeLogPath = path.relative(repoRoot, logPath);
    if (relativeLogPath.startsWith('..') || path.isAbsolute(relativeLogPath)) {
      throw new Error('REPLAY_LOG_MUST_BE_INSIDE_REPOSITORY');
    }
    if (!statSync(logPath).isFile()) throw new Error('REPLAY_LOG_NOT_A_FILE');
    const logBytes = readFileSync(logPath);
    const logSha256 = `sha256:${createHash('sha256').update(logBytes).digest('hex')}`;
    let sourceRunSummary = null;
    const summaryPath = logPath.replace(/\.txt$/i, '.summary.json');
    try {
      sourceRunSummary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    } catch {}
    const logContent = logBytes.toString('utf8');
    const replayRunId = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(repoRoot, '.tmp', 'atlas', 'svelte-check-runs', `replay-${replayRunId}`);
    mkdirSync(outputDir, { recursive: true });
    const outputPaths = {
      diagnostics: path.join(outputDir, 'diagnostics.jsonl'),
      todos: path.join(outputDir, 'todos.json'),
      summary: path.join(outputDir, 'summary.json'),
    };
    const parsed = parseSavedLog(logContent, {
      logPath: relativeLogPath.replace(/\\/g, '/'),
      logSha256,
      sourceRunSummary,
      replayWorkspaceRevision: gitRevision(),
    });
    const todoList = buildReplayProposal(parsed, {
      runId: parsed.summary.sourceRunId ?? `replay-${replayRunId}`,
      logPath: relativeLogPath.replace(/\\/g, '/'),
      replayWorkspaceRevision: parsed.summary.replayWorkspaceRevision,
    });
    let enrichedTodoList = todoList;
    if (args.includes('--enhance') || args.includes('--mcp-enrich')) {
      enrichedTodoList = buildWorkboardContext(enrichWithOkfAndDocs(enrichedTodoList));
    }
    if (args.includes('--mcp-enrich')) {
      if (parsed.summary.status !== 'COMPLETE' || enrichedTodoList.tasks.length === 0) {
        enrichedTodoList = await enrichTodoList(enrichedTodoList, async () => {
          throw new Error('MCP_ENRICHMENT_BLOCKED');
        }, {
          captureStatus: parsed.summary.status,
          sourceGitRevision: parsed.summary.sourceGitRevision,
        });
      } else {
        const client = createAtlasMcpClient({ serverPath: path.join(frontendRoot, 'scripts', 'mcp', 'atlas-tools-mcp.mjs') });
        try {
          const toolInventory = await client.initialize();
          enrichedTodoList = await enrichTodoList(enrichedTodoList, client.callTool, {
            captureStatus: parsed.summary.status,
            sourceGitRevision: parsed.summary.sourceGitRevision,
          });
          enrichedTodoList.enrichment.toolInventory = toolInventory;
        } catch (error) {
          enrichedTodoList.enrichment = {
            schema: 'atlas.svelte-check-mcp-enrichment.v1',
            authority: 'ADVISORY_ONLY',
            writesPerformed: false,
            status: 'UNAVAILABLE',
            reason: String(error?.message ?? error).slice(0, 300),
          };
        } finally {
          client.close();
        }
      }
    }
    const diagnosticsJsonl = parsed.diagnostics.map((diagnostic) => JSON.stringify(diagnostic)).join('\n');
    const resultSummary = {
      ...parsed.summary,
      replayedAt: new Date().toISOString(),
      outputs: {
        diagnostics: path.relative(repoRoot, outputPaths.diagnostics).replace(/\\/g, '/'),
        todos: path.relative(repoRoot, outputPaths.todos).replace(/\\/g, '/'),
        summary: path.relative(repoRoot, outputPaths.summary).replace(/\\/g, '/'),
      },
    };
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outputPaths.diagnostics, diagnosticsJsonl ? `${diagnosticsJsonl}\n` : '', { flag: 'wx' });
    writeFileSync(outputPaths.todos, `${JSON.stringify(enrichedTodoList, null, 2)}\n`, { flag: 'wx' });
    writeFileSync(outputPaths.summary, `${JSON.stringify(resultSummary, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(resultSummary, null, 2)}\n`);
    return 0;
  }

  const timeoutMs = Number(option('--timeout-ms', process.env.SVELTE_CHECK_TIMEOUT_MS ?? 600000));
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
    throw new Error('--timeout-ms must be an integer of at least 1000');
  }

  const outputDir = path.resolve(frontendRoot, option('--output-dir', '../.tmp/atlas/svelte-check-runs'));
  mkdirSync(outputDir, { recursive: true });
  const tsconfig = resolveTsconfig(option('--tsconfig', 'tsconfig.json'));

  const startedAt = new Date();
  const runId = startedAt.toISOString().replace(/[:.]/g, '-');
  const paths = {
    log: path.join(outputDir, `svelte-check-${runId}.txt`),
    diagnostics: path.join(outputDir, `svelte-check-${runId}.jsonl`),
    todos: path.join(outputDir, `svelte-check-${runId}.todos.json`),
    summary: path.join(outputDir, `svelte-check-${runId}.summary.json`),
  };
  const checkCli = path.join(frontendRoot, 'node_modules', 'svelte-check', 'bin', 'svelte-check');
  const commandArgs = ['--tsconfig', tsconfig.path, '--output', 'machine', '--no-color'];
  const logStream = createWriteStream(paths.log, { flags: 'wx' });
  const diagnosticsStream = createWriteStream(paths.diagnostics, { flags: 'wx' });
  const diagnostics = [];
  const logHash = createHash('sha256');
  let timedOut = false;
  let interrupted = false;
  let pendingSignal = null;

  const child = spawn(process.execPath, [checkCli, ...commandArgs], {
    cwd: frontendRoot,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const writeRaw = (chunk) => {
    logHash.update(chunk);
    logStream.write(chunk);
  };

  const consumeLines = (stream) => {
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    let pendingDiagnostic = null;
    const flush = () => {
      if (!pendingDiagnostic) return;
      diagnostics.push(pendingDiagnostic);
      diagnosticsStream.write(`${JSON.stringify(pendingDiagnostic)}\n`);
      pendingDiagnostic = null;
    };

    reader.on('line', (line) => {
      const diagnostic = parseMachineDiagnostic(line);
      if (diagnostic) {
        flush();
        pendingDiagnostic = diagnostic;
      } else if (/^https?:\/\//.test(line) && pendingDiagnostic) {
        const code = line.match(/\/e\/([^/?#]+)/)?.[1] ?? null;
        pendingDiagnostic.code = code ?? pendingDiagnostic.code;
        pendingDiagnostic.documentationUrl = line;
      } else {
        flush();
      }
    });
    reader.on('close', flush);
  };

  child.stdout.on('data', writeRaw);
  child.stderr.on('data', writeRaw);
  consumeLines(child.stdout);
  consumeLines(child.stderr);

  const onSignal = (signal) => {
    interrupted = true;
    pendingSignal = signal;
    child.kill();
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  const { exitCode, signal } = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, childSignal) => resolve({ exitCode: code, signal: childSignal }));
  }).finally(() => {
    clearTimeout(timeout);
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  });

  logStream.end();
  diagnosticsStream.end();
  await Promise.all([finished(logStream), finished(diagnosticsStream)]);

  const completedAt = new Date();
  const summary = {
    schema: 'atlas.svelte-check-capture.v1',
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    gitRevision: gitRevision(),
    tsconfig,
    command: `node ${path.relative(frontendRoot, checkCli).replace(/\\/g, '/')} ${commandArgs.join(' ')}`,
    exitCode,
    signal: pendingSignal ?? signal,
    timedOut,
    interrupted,
    writesPerformed: false,
    outputs: {
      log: path.relative(frontendRoot, paths.log).replace(/\\/g, '/'),
      diagnostics: path.relative(frontendRoot, paths.diagnostics).replace(/\\/g, '/'),
      todos: path.relative(frontendRoot, paths.todos).replace(/\\/g, '/'),
      summary: path.relative(frontendRoot, paths.summary).replace(/\\/g, '/'),
      logSha256: `sha256:${logHash.digest('hex')}`,
    },
    ...summarizeDiagnostics(diagnostics),
  };

  const { writeFileSync } = await import('node:fs');
  let todoList = buildTodoList(diagnostics, {
    runId,
    gitRevision: summary.gitRevision,
    logPath: summary.outputs.log,
  });
  if (args.includes('--enhance') || args.includes('--mcp-enrich')) {
    todoList = enrichWithOkfAndDocs(todoList);
    todoList = buildWorkboardContext(todoList);
  }
  if (args.includes('--mcp-enrich')) {
    const captureStatus = !timedOut && !interrupted && [0, 1].includes(exitCode) ? 'COMPLETE' : 'INCOMPLETE';
    if (captureStatus !== 'COMPLETE' || todoList.tasks.length === 0) {
      todoList = await enrichTodoList(todoList, async () => {
        throw new Error('MCP_ENRICHMENT_BLOCKED');
      }, { captureStatus, sourceGitRevision: summary.gitRevision });
    } else {
      const client = createAtlasMcpClient({ serverPath: path.join(frontendRoot, 'scripts', 'mcp', 'atlas-tools-mcp.mjs') });
      try {
        const toolInventory = await client.initialize();
        todoList = await enrichTodoList(todoList, client.callTool, {
          captureStatus,
          sourceGitRevision: summary.gitRevision,
        });
        todoList.enrichment.toolInventory = toolInventory;
      } catch (error) {
        todoList.enrichment = {
          schema: 'atlas.svelte-check-mcp-enrichment.v1',
          authority: 'ADVISORY_ONLY',
          writesPerformed: false,
          status: 'UNAVAILABLE',
          reason: String(error?.message ?? error).slice(0, 300),
        };
      } finally {
        client.close();
      }
    }
  }
  writeFileSync(paths.todos, `${JSON.stringify(todoList, null, 2)}\n`, { flag: 'wx' });
  writeFileSync(paths.summary, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (interrupted) return 130;
  if (timedOut) return 124;
  return exitCode ?? 1;
}

export {
  buildReviewDag,
  buildKanbanPlan,
  buildReplayProposal,
  buildTodoList,
  buildWorkboardContext,
  classifyDiagnostic,
  createAtlasMcpClient,
  currentSourceSnapshot,
  enrichTodoList,
  enrichWithOkfAndDocs,
  loadValidatedOkfVocabulary,
  matchOkfHints,
  matchPublishedDocs,
  parseMachineDiagnostic,
  parseSavedLog,
  resolveTsconfig,
  summarizeDiagnostics,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
