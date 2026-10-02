import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockHash, parseWfu, resolveDeclarations, sectionSlug, stripWfuComment, taskBlock } from './lib/wfu-metadata.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_REPORT_ROOT = path.join('docs', 'reports', 'openspec-evidence');

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const proofStates = new Set(['CLAIM_ONLY', 'PROVEN', 'PARTIAL', 'BLOCKED', 'FAILED', 'STALE']);

export function buildEvidenceReceiptV1(input) {
  const required = ['evidenceId', 'evidenceType', 'changeId', 'taskId', 'claim', 'workspaceRevision', 'sourceRevision', 'sourceRefs', 'producer', 'inputs', 'observedAt', 'expectedAssertions', 'actualAssertions', 'outputs', 'readbackRequired', 'readbackPerformed', 'verdict'];
  for (const field of required) if (input[field] === undefined || input[field] === null || input[field] === '') throw new Error(`EvidenceReceiptV1 missing ${field}`);
  if (input.schema !== 'atlas.evidence-receipt.v1') throw new Error('EvidenceReceiptV1 schema mismatch');
  if (!proofStates.has(input.verdict) || input.verdict === 'CLAIM_ONLY') throw new Error('EvidenceReceiptV1 verdict mismatch');
  if (!Array.isArray(input.expectedAssertions) || !Array.isArray(input.actualAssertions) || !Array.isArray(input.sourceRefs)) throw new Error('EvidenceReceiptV1 arrays required');
  if (input.verdict === 'PROVEN') {
    if (!input.expectedAssertions.length || !input.actualAssertions.length) throw new Error('EvidenceReceiptV1 proven requires assertions');
    const expectedIds = input.expectedAssertions.map((assertion) => assertion.id);
    const actualIds = input.actualAssertions.map((assertion) => assertion.id);
    if (expectedIds.some((id) => typeof id !== 'string' || !id.trim())
      || actualIds.some((id) => typeof id !== 'string' || !id.trim())
      || new Set(expectedIds).size !== expectedIds.length
      || new Set(actualIds).size !== actualIds.length
      || expectedIds.length !== actualIds.length
      || expectedIds.some((id) => !actualIds.includes(id))) throw new Error('EvidenceReceiptV1 assertion identity mismatch');
    if (input.actualAssertions.some((assertion) => assertion.passed !== true)) throw new Error('EvidenceReceiptV1 unsatisfied assertion');
  }
  if (input.verdict === 'PROVEN' && !input.independentVerifier && !input.verifier) throw new Error('EvidenceReceiptV1 independent verifier required');
  if (input.verdict === 'PROVEN' && input.readbackRequired && !input.readbackPerformed) throw new Error('EvidenceReceiptV1 readback required');
  if (input.verdict === 'STALE' && !input.staleReason) throw new Error('EvidenceReceiptV1 stale reason required');
  const { checksum: _checksum, ...unsigned } = input;
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

export function verifyEvidenceReceiptV1(receipt) {
  if (!receipt || typeof receipt !== 'object' || !receipt.checksum) throw new Error('EvidenceReceiptV1 checksum missing');
  const { checksum, ...unsigned } = receipt;
  if (checksum !== sha256(canonicalJson(unsigned))) throw new Error('EvidenceReceiptV1 checksum mismatch');
  return buildEvidenceReceiptV1(receipt);
}

export function buildEvidenceCardV1(input) {
  const required = ['schema', 'taskRef', 'changeId', 'taskId', 'claim', 'proofState', 'sourceRef', 'conceptID', 'confidenceScore', 'contextBlob', 'evidenceIds', 'workspaceRevision'];
  for (const field of required) if (input[field] === undefined || input[field] === null || input[field] === '') throw new Error(`EvidenceCardV1 missing ${field}`);
  if (input.schema !== 'atlas.evidence-card.v1') throw new Error('EvidenceCardV1 schema mismatch');
  if (!proofStates.has(input.proofState)) throw new Error('EvidenceCardV1 proof state mismatch');
  if (!Number.isFinite(input.confidenceScore) || input.confidenceScore < 0 || input.confidenceScore > 1) throw new Error('EvidenceCardV1 confidence score out of range');
  if (!Array.isArray(input.evidenceIds)) throw new Error('EvidenceCardV1 evidenceIds must be an array');
  const { checksum: _checksum, ...unsignedInput } = input;
  const unsigned = { retrievalUsable: true, proofUsable: false, rejectionReasons: [], ...unsignedInput };
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else result.push(full);
    }
  };
  visit(directory);
  return result;
}

function relative(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function normalizeTaskClaim(value) {
  return String(value ?? '')
    .replace(/^\s*(?:\*\*)?[A-Z][A-Z0-9]*(?:[-_.][A-Z0-9]+)+(?:\*\*)?\s+/, '')
    .replace(/^\s*\d+(?:\.\d+)+(?:[A-Za-z][A-Za-z0-9-]*)?\s+/, '')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalTaskRef(authorityScope, changeId, taskIdOrDerivedKey) {
  return `openspec-task:${authorityScope}/${changeId}/${taskIdOrDerivedKey}`;
}

export function parseTasksMarkdown(markdown, changeId, tasksPath, authorityScope = 'openspec://root', archived = false) {
  const lines = markdown.split(/\r?\n/);
  const declaredTasks = [];
  let currentSection = '';
  lines.forEach((line, index) => {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) currentSection = sectionSlug(heading[1]);
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (!match) return;
    const lineNumber = index + 1;
    const block = taskBlock(lines, index);
    declaredTasks.push({
      taskKey: `${changeId}:${lineNumber}`,
      change: changeId,
      source: tasksPath,
      line: lineNumber,
      text: stripWfuComment(match[2].trim()),
      state: match[1].toLowerCase() === 'x' ? 'DONE' : 'OPEN',
      sectionSlug: currentSection,
      sourceText: stripWfuComment(block.join('\n')),
      declared: parseWfu(block.join('\n')),
      blockHash: blockHash(block),
    });
  });
  resolveDeclarations(declaredTasks);
  const tasks = declaredTasks.map((task) => {
    const normalizedClaim = normalizeTaskClaim(task.text);
    const normalizedClaimHash = sha256(normalizedClaim);
    const derivedTaskKey = sha256(`${authorityScope}\0${changeId}\0${normalizedClaim}`);
    return {
      taskRef: `${tasksPath}#L${task.line}`,
      tasksPath,
      changeRef: `${authorityScope}/${changeId}`,
      authorityScope,
      archived,
      changeId,
      taskId: task.ledgerId ?? null,
      taskText: task.text,
      taskHash: task.blockHash,
      sourceLine: task.line,
      normalizedClaim,
      taskIdentity: {
        declaredTaskId: task.ledgerId ?? null,
        derivedTaskKey,
        changeId,
        authorityScope,
        sourcePath: tasksPath,
      sourceLine: task.line,
      sectionSlug: task.sectionSlug,
      normalizedClaimHash,
      identityState: normalizedClaim ? (task.ledgerId ? 'DECLARED_ID' : 'DERIVED_ID') : 'INVALID',
        logicalTaskKey: task.taskIdentity.logicalTaskKey,
        migrationKey: task.taskIdentity.migrationKey,
        resolverBasis: task.taskIdentity.basis,
      },
      canonicalTaskRef: canonicalTaskRef(authorityScope, changeId, task.ledgerId ?? derivedTaskKey),
      declaredChecked: task.state === 'DONE',
      declaredDependencies: task.declared?.dependsOn ?? null,
      dependencySourceText: task.sourceText,
      resolvedDependencyTaskKeys: task.dependsOnTaskIds ?? [],
      unresolvedDependencies: task.declared?.unresolvedDepends ?? [],
      ambiguousDependencies: task.declared?.ambiguousDepends ?? [],
      dependencyCycleAffected: task.declared?.dependencyState === 'CYCLE_OR_DOWNSTREAM_OF_CYCLE',
      dependencyDeclaration: task.declared,
    };
  });

  const declaredCounts = new Map();
  const derivedCounts = new Map();
  for (const task of tasks) {
    const declaredKey = task.taskId === null ? null : `${authorityScope}\0${changeId}\0${task.taskId}`;
    if (declaredKey) declaredCounts.set(declaredKey, (declaredCounts.get(declaredKey) ?? 0) + 1);
    const derivedKey = `${authorityScope}\0${changeId}\0${task.taskIdentity.derivedTaskKey}`;
    derivedCounts.set(derivedKey, (derivedCounts.get(derivedKey) ?? 0) + 1);
  }
  for (const task of tasks) {
    const declaredKey = task.taskId === null ? null : `${authorityScope}\0${changeId}\0${task.taskId}`;
    const derivedKey = `${authorityScope}\0${changeId}\0${task.taskIdentity.derivedTaskKey}`;
    if (task.taskIdentity.identityState === 'INVALID'
      || (declaredKey && declaredCounts.get(declaredKey) > 1)
      || derivedCounts.get(derivedKey) > 1) {
      task.taskIdentity.identityState = task.taskIdentity.identityState === 'INVALID' ? 'INVALID' : 'AMBIGUOUS';
    }
    task.canonicalTaskRef = canonicalTaskRef(authorityScope, changeId, task.taskId ?? task.taskIdentity.derivedTaskKey);
    task.taskKey = task.canonicalTaskRef;
    task.taskIdStatus = task.taskIdentity.identityState === 'AMBIGUOUS'
      ? 'AMBIGUOUS'
      : task.taskId === null ? 'DERIVED_ID' : 'DECLARED_ID';
  }
  return tasks;
}

function extractRequirements(root, changeDir) {
  const specFiles = listFiles(path.join(changeDir, 'specs'))
    .concat(fs.existsSync(path.join(changeDir, 'spec.md')) ? [path.join(changeDir, 'spec.md')] : [])
    .filter((file) => path.extname(file).toLowerCase() === '.md')
    .sort();
  const requirements = [];
  for (const file of specFiles) {
    const lines = readText(file).split(/\r?\n/);
    let currentRequirement = null;
    lines.forEach((line, index) => {
      const requirement = line.match(/^#{2,6}\s+Requirement:\s*(.+?)\s*#*$/i);
      if (requirement) {
        currentRequirement = { sourceRef: `${relative(root, file)}#L${index + 1}`, title: requirement[1].trim(), scenarios: [] };
        requirements.push(currentRequirement);
        return;
      }
      const scenario = line.match(/^#{2,6}\s+Scenario:\s*(.+?)\s*#*$/i);
      if (scenario && currentRequirement) currentRequirement.scenarios.push({ title: scenario[1].trim(), line: index + 1 });
    });
  }
  return { specFiles: specFiles.map((file) => relative(root, file)), requirements };
}

function companionInventory(root, changeDir) {
  const files = listFiles(changeDir);
  const names = files.map((file) => path.basename(file).toLowerCase());
  const testFiles = files.filter((file) => /\.(?:test|spec)\.(?:mjs|mts|js|ts|py)$/i.test(path.basename(file)));
  return {
    fileCount: files.length,
    proposalCount: names.filter((name) => name === 'proposal.md').length,
    designCount: names.filter((name) => name === 'design.md').length,
    specCount: names.filter((name) => name === 'spec.md').length,
    statusCount: names.filter((name) => name === 'status.json').length,
    testCount: testFiles.length,
    testFiles: testFiles.map((file) => relative(root, file)).sort(),
    receiptFilenameCandidateCount: files.filter((file) => /(^|[-_])receipt([-_.]|$)/i.test(path.basename(file))).length,
    ...extractRequirements(root, changeDir),
    paths: files.map((file) => relative(root, file)).sort(),
  };
}

export function detectCycles(edges) {
  const graph = new Map();
  for (const edge of edges) {
    if (!graph.has(edge.from)) graph.set(edge.from, []);
    graph.get(edge.from).push(edge.to);
  }
  const active = new Set();
  const complete = new Set();
  const cycles = [];
  const visit = (node, stack) => {
    if (active.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(Math.max(0, start)), node]);
      return;
    }
    if (complete.has(node)) return;
    active.add(node);
    for (const next of graph.get(node) ?? []) visit(next, [...stack, node]);
    active.delete(node);
    complete.add(node);
  };
  for (const node of graph.keys()) visit(node, []);
  return cycles;
}

const TASK_REFERENCE_RE = /(?:openspec:\/\/[^\s)`]+|(?:sveltekit-frontend\/)?openspec\/changes\/[^\s)`]+\/tasks\.md(?:#L\d+)?)/gi;
const TASK_ID_RE = /\b(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\d[A-Z0-9]*|\d+(?:\.\d+)+(?:[a-z][a-z0-9-]*)?)\b/g;

function taskIdTokens(text) {
  return [...new Set(String(text ?? '').match(TASK_ID_RE) ?? [])]
    .filter((token) => !/^SHA-(?:1|256|384|512)$/i.test(token) && !/^[A-Z]\d+-[A-Z]\d+$/i.test(token));
}

export function extractDependencyCandidates(task) {
  const candidates = [];
  const seen = new Set();
  const add = (rawTarget, relation, parser, confidence) => {
    const target = String(rawTarget ?? '').trim().replace(/^[`'"([{]+|[`'"),.;\]}]+$/g, '');
    if (!target) return;
    const key = `${relation}\0${parser}\0${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      fromTaskKey: task.canonicalTaskRef,
      authorityScope: task.authorityScope,
      changeId: task.changeId,
      rawTarget: target,
      relation,
      parser,
      confidence,
      sourceRef: task.taskRef,
      resolution: 'MISSING_TARGET',
      resolvedTaskKey: null,
      resolutionDetail: null,
    });
  };

  for (const target of task.declaredDependencies ?? []) add(target, 'REQUIRES', 'EXPLICIT_FIELD', 1);

  const text = task.dependencySourceText ?? task.taskText;
  for (const match of text.matchAll(/\bdependsOn\s*:\s*\[([^\]]*)\]|\bdepends_on\s*=\s*([^;\n]+)/gi)) {
    for (const target of taskIdTokens(match[1] ?? match[2])) add(target, 'REQUIRES', 'EXPLICIT_FIELD', 0.99);
  }
  for (const match of text.matchAll(/\bblockedBy\s*[:=]\s*(?:\[([^\]]*)\]|([^;\n]+))/gi)) {
    for (const target of taskIdTokens(match[1] ?? match[2])) add(target, 'BLOCKED_BY', 'EXPLICIT_FIELD', 0.99);
  }
  for (const match of text.matchAll(TASK_REFERENCE_RE)) {
    if (match[0] !== task.tasksPath && !match[0].startsWith(`openspec://${task.authorityScope.slice('openspec://'.length)}/${task.changeId}/`)) {
      add(match[0], 'REQUIRES', 'MARKDOWN_REFERENCE', 0.98);
    }
  }

  for (const match of text.matchAll(/([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\d[A-Z0-9]*|\d+(?:\.\d+)+)\s*(?:→|->|⇒)\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\d[A-Z0-9]*|\d+(?:\.\d+)+)/g)) {
    const [, left, right] = match;
    const currentId = task.taskIdentity.declaredTaskId;
    if (currentId === right) add(left, 'REQUIRES', 'ARROW_REFERENCE', 0.9);
    else if (currentId === left) add(right, 'RUN_AFTER', 'ARROW_REFERENCE', 0.7);
    else add(`${left} -> ${right}`, 'UNKNOWN', 'ARROW_REFERENCE', 0.55);
  }

  const prosePatterns = [
    ['BLOCKED_BY', /\bblocked\s+by\s+([^\n.;]+)/gi],
    ['REQUIRES', /\b(?:depends\s+on|requires?|prerequisites?)\b\s*:?\s*([^\n.;]+)/gi],
    ['RUN_AFTER', /\bafter\s+([^\n.;]+)/gi],
    ['SUPERSEDES', /\bsupersedes?\s+([^\n.;]+)/gi],
  ];
  for (const [relation, pattern] of prosePatterns) {
    for (const match of text.matchAll(pattern)) {
      for (const target of taskIdTokens(match[1])) add(target, relation, 'PROSE_PATTERN', 0.8);
    }
  }
  return candidates;
}

export function resolveDependencyCandidate(candidate, tasks) {
  const canonicalMatch = tasks.find((task) => task.canonicalTaskRef === candidate.rawTarget);
  if (canonicalMatch) return { ...candidate, resolution: 'RESOLVED', resolvedTaskKey: canonicalMatch.canonicalTaskRef, resolutionDetail: null };
  const normalizedTarget = candidate.rawTarget.replaceAll('\\', '/').replace(/^\.\//, '');
  const pathMatch = normalizedTarget.match(/^(sveltekit-frontend\/)?openspec\/changes\/([^/]+)\/tasks\.md(?:#L(\d+))?$/i);
  const uriMatch = normalizedTarget.match(/^openspec:\/\/([^/]+)\/([^/]+)\/tasks\.md(?:#L(\d+))?$/i);
  let matches = [];
  if (pathMatch || uriMatch) {
    const authority = uriMatch ? `openspec://${uriMatch[1]}` : pathMatch[1] ? 'openspec://frontend' : 'openspec://root';
    const changeId = uriMatch?.[2] ?? pathMatch?.[2];
    const lineText = uriMatch?.[3] ?? pathMatch?.[3];
    if (!lineText) {
      return {
        ...candidate,
        resolution: 'CHANGE_LEVEL_REFERENCE',
        resolvedTaskKey: null,
        resolutionDetail: 'TASKS_FILE_REFERENCE_WITHOUT_TASK_ANCHOR',
        referencedAuthorityScope: authority,
        referencedChangeId: changeId,
      };
    }
    const line = lineText ? Number(lineText) : null;
    matches = tasks.filter((task) => task.changeId === changeId
      && task.authorityScope === authority
      && (!line || task.sourceLine === line));
  } else {
    const targetIds = taskIdTokens(candidate.rawTarget);
    if (targetIds.length === 1) {
      const targetId = targetIds[0];
      const local = tasks.filter((task) => task.authorityScope === candidate.authorityScope
        && task.taskIdentity.declaredTaskId === targetId);
      const sameChange = local.filter((task) => task.changeId === candidate.changeId);
      matches = sameChange.length ? sameChange : local;
      if (!matches.length) {
        const crossAuthority = tasks.filter((task) => task.taskIdentity.declaredTaskId === targetId);
        if (crossAuthority.length) {
          return { ...candidate, resolution: 'AMBIGUOUS', resolutionDetail: 'MATCHES_OTHER_AUTHORITY_SCOPE' };
        }
      }
    }
  }
  if (matches.length === 1) {
    return { ...candidate, resolution: 'RESOLVED', resolvedTaskKey: matches[0].canonicalTaskRef, resolutionDetail: null };
  }
  if (matches.length > 1) return { ...candidate, resolution: 'AMBIGUOUS', resolutionDetail: 'MULTIPLE_TASKS_MATCH' };
  return { ...candidate, resolution: 'MISSING_TARGET', resolutionDetail: 'NO_EXACT_TASK_MATCH' };
}

export function classifyTaskDuplicates(tasks) {
  const groups = [];
  const addGroupedPairs = (map, makeClassification, matchFilter = () => true) => {
    for (const entries of map.values()) {
      if (entries.length < 2) continue;
      for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
          const left = entries[leftIndex];
          const right = entries[rightIndex];
          if (!matchFilter(left, right)) continue;
          groups.push({
            classification: makeClassification(left, right),
            taskRefs: [left.taskRef, right.taskRef],
            canonicalTaskRefs: [left.canonicalTaskRef, right.canonicalTaskRef],
            authorityScopes: [left.authorityScope, right.authorityScope],
            changeIds: [left.changeId, right.changeId],
          });
        }
      }
    }
  };
  const groupBy = (items, keyOf) => {
    const map = new Map();
    for (const item of items) {
      const key = keyOf(item);
      if (key) map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  };

  const declared = tasks.filter((task) => task.taskIdentity.declaredTaskId);
  addGroupedPairs(groupBy(declared, (task) => `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity.declaredTaskId}`), () => 'DUPLICATE_DECLARED_ID_SAME_CHANGE');
  addGroupedPairs(groupBy(declared, (task) => `${task.authorityScope}\0${task.taskIdentity.declaredTaskId}`), (left, right) => left.changeId === right.changeId ? 'DUPLICATE_DECLARED_ID_SAME_CHANGE' : 'DUPLICATE_DECLARED_ID_CROSS_CHANGE', (left, right) => left.changeId !== right.changeId);
  addGroupedPairs(groupBy(declared, (task) => task.taskIdentity.declaredTaskId), (left, right) => left.authorityScope !== right.authorityScope ? 'NAMESPACE_COLLISION' : 'DUPLICATE_DECLARED_ID_CROSS_CHANGE', (left, right) => left.authorityScope !== right.authorityScope);
  addGroupedPairs(groupBy(tasks, (task) => `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity.normalizedClaimHash}`), () => 'DUPLICATE_NORMALIZED_CLAIM_SAME_CHANGE');
  addGroupedPairs(groupBy(tasks, (task) => `${task.authorityScope}\0${task.taskIdentity.normalizedClaimHash}`), (left, right) => left.changeId === right.changeId ? 'DUPLICATE_NORMALIZED_CLAIM_SAME_CHANGE' : 'DUPLICATE_NORMALIZED_CLAIM_CROSS_CHANGE', (left, right) => left.changeId !== right.changeId);
  addGroupedPairs(groupBy(tasks, (task) => `${task.authorityScope}\0${task.taskIdentity.derivedTaskKey}`), () => 'DUPLICATE_DERIVED_KEY');
  addGroupedPairs(groupBy(tasks, (task) => `${task.authorityScope}\0${task.taskIdentity.normalizedClaimHash}`), () => 'ARCHIVE_DUPLICATE', (left, right) => left.archived !== right.archived);
  addGroupedPairs(groupBy(tasks, (task) => `${task.changeId}\0${task.taskId ?? ''}\0${task.taskIdentity.normalizedClaimHash}`), () => 'MIRROR_DUPLICATE', (left, right) => left.authorityScope !== right.authorityScope && left.taskId !== null && right.taskId !== null);
  return groups;
}

function inventoryDependencySyntax(tasks, candidates) {
  const forms = {
    WFU_DECLARED_DEPENDS: 0,
    PROSE_DEPENDS_ON: 0,
    PROSE_BLOCKED_BY: 0,
    PROSE_REQUIRES: 0,
    PROSE_AFTER: 0,
    PROSE_PREREQUISITE: 0,
    EXPLICIT_DEPENDS_ON_FIELD: 0,
    EXPLICIT_BLOCKED_BY_FIELD: 0,
    ARROW_REFERENCE: 0,
    MARKDOWN_TASK_REFERENCE: 0,
  };
  const patterns = {
    PROSE_DEPENDS_ON: /\bdepends\s+on\b/gi,
    PROSE_BLOCKED_BY: /\bblocked\s+by\b/gi,
    PROSE_REQUIRES: /\brequires?\b/gi,
    PROSE_AFTER: /\bafter\b/gi,
    PROSE_PREREQUISITE: /\bprerequisite(?:s)?\b/gi,
    EXPLICIT_DEPENDS_ON_FIELD: /\bdependsOn\s*:\s*\[/gi,
    EXPLICIT_BLOCKED_BY_FIELD: /\bblockedBy\s*[:=]/gi,
    ARROW_REFERENCE: /(?:→|->|⇒)/g,
    MARKDOWN_TASK_REFERENCE: /(?:openspec:\/\/[^\s)`]+|(?:sveltekit-frontend\/)?openspec\/changes\/[^\s)`]+\/tasks\.md(?:#L\d+)?)/gi,
  };
  for (const task of tasks) {
    forms.WFU_DECLARED_DEPENDS += task.declaredDependencies?.length ?? 0;
    for (const [name, pattern] of Object.entries(patterns)) forms[name] += [...task.dependencySourceText.matchAll(pattern)].length;
  }
  const candidatesByParser = Object.fromEntries([...new Set(candidates.map((candidate) => candidate.parser))]
    .map((parser) => [parser, candidates.filter((candidate) => candidate.parser === parser).length]));
  const observedSyntaxExpressions = Object.values(forms).reduce((sum, count) => sum + count, 0);
  return {
    forms,
    observedSyntaxExpressions,
    candidateCount: candidates.length,
    candidatesByParser,
    unrepresentedExpressionLowerBound: Math.max(0, observedSyntaxExpressions - candidates.length),
    sourceRefs: [...new Set(candidates.map((candidate) => candidate.sourceRef))],
  };
}

function buildParserGates({ changes, tasks, dependencySyntax, dependencies, receiptBindings, receipts, historicalCandidates, duplicateGroups }) {
  const checkboxSourceCount = changes.reduce((sum, change) => sum + change.checklistRows, 0);
  const boundReceiptCount = receiptBindings.filter((binding) => binding.resolution === 'BOUND').length;
  const exactSourceBindings = receiptBindings.filter((binding) => binding.bindingType === 'BOUND_SOURCE_REF').length;
  const invalidIdentityCount = tasks.filter((task) => task.taskIdentity.identityState === 'INVALID').length;
  const parserGates = [
    {
      gateId: 'EVF-PARSE-01',
      name: 'CHECKBOX_COVERAGE',
      status: checkboxSourceCount === tasks.length ? 'PASS' : 'FAILED',
      sourceCheckboxes: checkboxSourceCount,
      parsedTasks: tasks.length,
    },
    {
      gateId: 'EVF-PARSE-02',
      name: 'IDENTITY_COVERAGE',
      status: tasks.every((task) => task.taskIdentity.derivedTaskKey && task.taskIdentity.authorityScope && task.taskIdentity.normalizedClaimHash) && invalidIdentityCount === 0 ? 'PASS' : 'FAILED',
      total: tasks.length,
      declared: tasks.filter((task) => task.taskIdentity.identityState === 'DECLARED_ID').length,
      derived: tasks.filter((task) => task.taskIdentity.identityState === 'DERIVED_ID').length,
      ambiguous: tasks.filter((task) => task.taskIdentity.identityState === 'AMBIGUOUS').length,
      invalid: invalidIdentityCount,
    },
    {
      gateId: 'EVF-PARSE-03',
      name: 'DEPENDENCY_CANDIDATE_COVERAGE',
      status: dependencySyntax.observedSyntaxExpressions === 0 || dependencySyntax.candidateCount > 0 ? 'PASS' : 'FAILED',
      observedSyntaxExpressions: dependencySyntax.observedSyntaxExpressions,
      candidates: dependencySyntax.candidateCount,
      resolved: dependencies.length,
      unrepresentedExpressionLowerBound: dependencySyntax.unrepresentedExpressionLowerBound,
      forms: dependencySyntax.forms,
    },
    {
      gateId: 'EVF-PARSE-04',
      name: 'RECEIPT_BINDING_COVERAGE',
      status: historicalCandidates.length + receipts.length > 100 && boundReceiptCount === 0 ? 'FAILED' : 'PASS',
      receipts: historicalCandidates.length + receipts.length,
      bound: boundReceiptCount,
      candidateOnly: receiptBindings.filter((binding) => binding.bindingType === 'CANDIDATE_ONLY').length,
      ambiguous: receiptBindings.filter((binding) => binding.resolution === 'AMBIGUOUS').length,
    },
    {
      gateId: 'EVF-PARSE-05',
      name: 'SOURCE_REF_RESOLUTION',
      status: receipts.length === 0 ? 'BLOCKED' : exactSourceBindings > 0 ? 'PASS' : 'FAILED',
      canonicalReceipts: receipts.length,
      exactSourceBindings,
    },
    {
      gateId: 'EVF-PARSE-06',
      name: 'AUTHORITY_SCOPE_CLASSIFICATION',
      status: tasks.every((task) => ['openspec://root', 'openspec://frontend'].includes(task.authorityScope)) ? 'PASS' : 'FAILED',
      authorityScopes: [...new Set(tasks.map((task) => task.authorityScope))].sort(),
      changes: changes.length,
    },
    {
      gateId: 'EVF-PARSE-07',
      name: 'ARCHIVE_MIRROR_CLASSIFICATION',
      status: duplicateGroups.every((group) => ['DUPLICATE_DECLARED_ID_SAME_CHANGE', 'DUPLICATE_DECLARED_ID_CROSS_CHANGE', 'DUPLICATE_NORMALIZED_CLAIM_SAME_CHANGE', 'DUPLICATE_NORMALIZED_CLAIM_CROSS_CHANGE', 'MIRROR_DUPLICATE', 'ARCHIVE_DUPLICATE', 'NAMESPACE_COLLISION', 'DUPLICATE_DERIVED_KEY'].includes(group.classification)) ? 'PASS' : 'FAILED',
      duplicateGroups: duplicateGroups.length,
      classifications: Object.fromEntries([...new Set(duplicateGroups.map((group) => group.classification))]
        .map((classification) => [classification, duplicateGroups.filter((group) => group.classification === classification).length])),
    },
  ];
  const parserIncomplete = tasks.length > 100 && dependencySyntax.candidateCount > 0 && dependencies.length === 0;
  const bindingIncomplete = historicalCandidates.length + receipts.length > 100 && boundReceiptCount === 0;
  return {
    censusStatus: parserIncomplete ? 'PARSER_INCOMPLETE' : bindingIncomplete ? 'BINDING_INCOMPLETE' : 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE',
    additionalBlockingStatuses: [
      ...(parserIncomplete ? ['PARSER_INCOMPLETE'] : []),
      ...(bindingIncomplete ? ['BINDING_INCOMPLETE'] : []),
      ...(receipts.length === 0 ? ['CANONICAL_RECEIPTS_NOT_OBSERVED'] : []),
    ],
    parserGates,
    promotionEligible: false,
  };
}

function gitCommit(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function receiptCandidates(root) {
  const directories = ['docs/reports', 'docs/receipts', 'evidence', 'receipts']
    .map((entry) => path.join(root, entry));
  const runScopedReceipts = listFiles(path.join(root, 'docs', 'reports', 'openspec-evidence'))
    .filter((file) => /receipt.*\.json$/i.test(path.basename(file)));
  return [...new Set([...directories.flatMap(listFiles), ...runScopedReceipts])].filter((file) => {
    if (path.extname(file).toLowerCase() !== '.json') return false;
    const sourceRef = relative(root, file);
    if (sourceRef.startsWith('docs/reports/openspec-evidence/') && !/receipt.*\.json$/i.test(path.basename(file))) return false;
    return !isDerivedEvidenceReport(path.basename(file));
  });
}

function isDerivedEvidenceReport(fileName) {
  return /^openspec-evidence-(?:cards|context-manifest|embedding-plan|gpu-acceleration-plan|health|hybrid-rrf-audit|ledger-import-plan|ledger-readback|low-rank-plan|migration-dry-run|portfolio-census|projection-parity-plan|retrieval-plan|synthesis-plan|turbovec-memory-plan|workboard-projection)-v\d+\.json$/i.test(fileName)
    || /^openspec-evidence-feature-packets-v\d+\.json$/i.test(fileName)
    || /^openspec-receipt-type-classification-v\d+\.json$/i.test(fileName)
    || /^openspec-orphan-binding-resolution-v\d+\.json$/i.test(fileName)
    || /^openspec-task-identity-recovery-v\d+\.json$/i.test(fileName)
    || /^openspec-golden-task-gs1-10-v\d+\.json$/i.test(fileName)
    || /^openspec-evidence-summary-v\d+\.json$/i.test(fileName)
    || /^openspec-evidence-surfaces-audit-v\d+\.json$/i.test(fileName)
    || /^openspec-evidence-pipeline-v\d+\.json$/i.test(fileName)
    || /^openspec-evidence-census-reconciliation-v\d+\.json$/i.test(fileName)
    || /^openspec-receipt-binding-v1\.json$/i.test(fileName)
    || /^openspec-task-evidence-bindings-v1\.json$/i.test(fileName)
    || /^openspec-workboard-evidence-reconciliation-v1\.json$/i.test(fileName);
}

const RECEIPT_FIELD_NAMES = {
  evidenceIds: new Set(['evidenceid', 'receiptid']),
  taskIds: new Set(['task', 'taskid', 'taskids', 'taskkey', 'taskkeys', 'selectedtaskkey']),
  claimIds: new Set(['claimid', 'requirementid']),
  taskRefs: new Set(['taskref', 'canonicaltaskref', 'openspectaskref', 'taskpath', 'taskreference', 'taskreferences']),
  changeIds: new Set(['changeid', 'change', 'openspecchange']),
  sourceRefs: new Set(['sourceref', 'sourcerefs', 'sourcepath', 'sourcepaths', 'legacysourceref', 'legacysourcerefs', 'canonicalsourceref', 'canonicalsourcerefs', 'evidenceref', 'evidencerefs', 'receiptref', 'receiptrefs']),
  gateIds: new Set(['gate', 'gateid', 'gatekey', 'predicateid']),
  claims: new Set(['claim', 'tasktext', 'tasktitle']),
  commands: new Set(['command', 'verificationcommand', 'testcommand']),
  workspaceRevisions: new Set(['workspacerevision', 'workspace_revision']),
  sourceRevisions: new Set(['sourcerevision', 'source_revision']),
  checksums: new Set(['checksum', 'receiptchecksum']),
  verdicts: new Set(['verdict', 'proofstate', 'status']),
};

function normalizedFieldName(value) {
  return String(value).replace(/[_-]/g, '').toLowerCase();
}

function collectReceiptFields(value, depth = 0, output = Object.fromEntries(Object.keys(RECEIPT_FIELD_NAMES).map((key) => [key, []]))) {
  if (depth > 7 || value === null || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 500)) collectReceiptFields(entry, depth + 1, output);
    return output;
  }
  for (const [key, entry] of Object.entries(value).slice(0, 1000)) {
    const normalized = normalizedFieldName(key);
    for (const [target, aliases] of Object.entries(RECEIPT_FIELD_NAMES)) {
      if (!aliases.has(normalized)) continue;
      if (typeof entry === 'string' && entry.trim()) output[target].push(entry.trim());
      else if (Array.isArray(entry)) {
        for (const item of entry.slice(0, 200)) {
          if (typeof item === 'string' && item.trim()) output[target].push(item.trim());
          else if (item && typeof item === 'object') {
            for (const nestedKey of ['file', 'uri', 'path', 'sourceRef', 'taskRef', 'id', 'value']) {
              if (typeof item[nestedKey] === 'string' && item[nestedKey].trim()) output[target].push(item[nestedKey].trim());
            }
          }
        }
      }
    }
    if (entry && typeof entry === 'object') collectReceiptFields(entry, depth + 1, output);
  }
  if (depth === 0) {
    for (const key of Object.keys(output)) output[key] = [...new Set(output[key])].slice(0, 100);
  }
  return output;
}

function receiptFileCandidate(file, schema) {
  return /(?:receipt|evidence|proof|audit)/i.test(path.basename(file))
    || /(?:receipt|evidence|proof|audit)/i.test(schema);
}

function indexReceipts(root) {
  const receipts = [];
  const invalidReceipts = [];
  const historicalCandidates = [];
  let unreadableCandidates = 0;
  let oversizedCandidates = 0;
  for (const file of receiptCandidates(root)) {
    let parsed;
    try {
      if (fs.statSync(file).size > 4 * 1024 * 1024) {
        oversizedCandidates += 1;
        continue;
      }
      parsed = JSON.parse(readText(file));
    } catch {
      unreadableCandidates += 1;
      continue;
    }
    const schema = typeof parsed?.schema === 'string' ? parsed.schema : '';
    if (!receiptFileCandidate(file, schema)) continue;
    if (parsed?.schema === 'atlas.evidence-receipt.v1') {
      try {
        receipts.push({ uri: relative(root, file), ...verifyEvidenceReceiptV1(parsed), canonicalSchemaValid: true });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        invalidReceipts.push({ uri: relative(root, file), schema, reason, failureKind: /checksum/i.test(reason) ? 'CHECKSUM_FAILED' : 'INVALID_SCHEMA' });
      }
      continue;
    }
    historicalCandidates.push({
      uri: relative(root, file),
      fileName: path.basename(file),
      schema: schema || null,
      fields: collectReceiptFields(parsed),
      canonicalSchemaValid: false,
    });
  }
  return { receipts, invalidReceipts, historicalCandidates, unreadableCandidates, oversizedCandidates };
}

function inferReceiptAuthority(fields) {
  for (const sourceRef of fields.sourceRefs) {
    const normalized = sourceRef.replaceAll('\\', '/');
    if (normalized.startsWith('sveltekit-frontend/openspec/')) return 'openspec://frontend';
    if (normalized.startsWith('openspec/')) return 'openspec://root';
  }
  return null;
}

function buildReceiptBindingIndexes(tasks) {
  const byRef = new Map();
  const byDeclaredIdentity = new Map();
  const byDeclaredId = new Map();
  const byChangeId = new Map();
  const scopesByChange = new Map();
  const bySourceRef = new Map();
  const byGateId = new Map();
  const byClaimHash = new Map();
  const add = (map, key, task) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), task]);
  };
  for (const task of tasks) {
    byChangeId.set(task.changeId, [...(byChangeId.get(task.changeId) ?? []), task]);
    scopesByChange.set(task.changeId, [...new Set([...(scopesByChange.get(task.changeId) ?? []), task.authorityScope])]);
    add(byRef, task.canonicalTaskRef, task);
    add(byRef, task.taskRef, task);
    add(byRef, `${task.tasksPath}#L${task.sourceLine}`, task);
    if (task.taskId) {
      add(byDeclaredIdentity, `${task.authorityScope}\0${task.changeId}\0${task.taskId}`, task);
      add(byDeclaredId, task.taskId, task);
    }
    add(byClaimHash, `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity.normalizedClaimHash}`, task);
    add(bySourceRef, task.tasksPath, task);
    for (const match of task.dependencySourceText.matchAll(/(?:^|\s|[`'"(])((?:[A-Za-z0-9_@.$-]+\/)+[A-Za-z0-9_@.$-]+\.[A-Za-z0-9]+)(?=$|\s|[`'"),;])/g)) add(bySourceRef, match[1].replaceAll('\\', '/'), task);
    for (const gateId of taskIdTokens(task.dependencySourceText).filter((id) => /(?:GATE|PREDICATE|REQ|REQUIREMENT)/i.test(id))) add(byGateId, `${task.authorityScope}\0${gateId.toUpperCase()}`, task);
  }
  return { byRef, byDeclaredIdentity, byDeclaredId, byChangeId, scopesByChange, bySourceRef, byGateId, byClaimHash };
}

function uniqueBinding(matches, strategy, bindingType) {
  const unique = [...new Map(matches.map((task) => [task.canonicalTaskRef, task])).values()];
  if (unique.length === 1) return { task: unique[0], strategy, bindingType, resolution: 'BOUND' };
  if (unique.length > 1) return { task: null, strategy, bindingType, resolution: 'AMBIGUOUS', candidateTaskRefs: unique.map((task) => task.canonicalTaskRef) };
  return null;
}

export function resolveReceiptBinding(receipt, indexes, tasks) {
  const fields = receipt.fields ?? collectReceiptFields(receipt);
  const authority = inferReceiptAuthority(fields);
  const canonicalTaskRefs = fields.taskIds.filter((taskId) => taskId.startsWith('openspec-task:') || taskId.startsWith('openspec://'));
  const exactRefs = [...fields.taskRefs, ...canonicalTaskRefs].flatMap((reference) => indexes.byRef.get(reference) ?? []);
  let binding = uniqueBinding(exactRefs, 'EXACT_CANONICAL_TASK_REF', 'BOUND_EXACT');
  if (binding) return binding;

  for (const changeId of fields.changeIds) {
    for (const taskId of fields.taskIds) {
      const scopes = authority ? [authority] : indexes.scopesByChange.get(changeId) ?? [];
      const matches = scopes.flatMap((scope) => indexes.byDeclaredIdentity.get(`${scope}\0${changeId}\0${taskId}`) ?? []);
      binding = uniqueBinding(matches, 'EXACT_DECLARED_TASK_ID_WITHIN_CHANGE', 'BOUND_ALIAS');
      if (binding) return binding;
    }
  }

  for (const sourceRef of fields.sourceRefs) {
    const matches = indexes.bySourceRef.get(sourceRef.replaceAll('\\', '/')) ?? [];
    binding = uniqueBinding(matches, 'EXACT_TASK_SOURCE_REF', 'BOUND_SOURCE_REF');
    if (binding) return binding;
  }

  for (const gateId of fields.gateIds) {
    for (const changeId of fields.changeIds) {
      const scopes = authority ? [authority] : indexes.scopesByChange.get(changeId) ?? [];
      const matches = scopes.flatMap((scope) => indexes.byGateId.get(`${scope}\0${gateId.toUpperCase()}`) ?? [])
        .filter((task) => task.changeId === changeId);
      binding = uniqueBinding(matches, 'EXACT_GATE_ID_WITHIN_CHANGE', 'BOUND_ALIAS');
      if (binding) return binding;
    }
  }

  const claimHash = fields.claims[0] ? sha256(normalizeTaskClaim(fields.claims[0])) : null;
  if (claimHash) {
    for (const changeId of fields.changeIds) {
      const scopes = authority ? [authority] : indexes.scopesByChange.get(changeId) ?? [];
      const matches = scopes.flatMap((scope) => indexes.byClaimHash.get(`${scope}\0${changeId}\0${claimHash}`) ?? []);
      binding = uniqueBinding(matches, 'RECEIPT_CHANGE_ID_AND_CLAIM_HASH', 'BOUND_ALIAS');
      if (binding) return binding;
    }
  }

  for (const alias of fields.claimIds) {
    for (const changeId of fields.changeIds) {
      const scopes = authority ? [authority] : indexes.scopesByChange.get(changeId) ?? [];
      const matches = scopes.flatMap((scope) => indexes.byDeclaredIdentity.get(`${scope}\0${changeId}\0${alias}`) ?? []);
      binding = uniqueBinding(matches, 'KNOWN_LEGACY_ALIAS', 'BOUND_ALIAS');
      if (binding) return binding;
    }
  }

  const fileName = String(receipt.fileName ?? receipt.uri ?? '').toLowerCase();
  const filenameMatches = [
    ...new Set([
      ...[...indexes.byChangeId.entries()].filter(([changeId]) => fileName.includes(changeId.toLowerCase())).flatMap(([, matches]) => matches),
      ...taskIdTokens(fileName).flatMap((taskId) => indexes.byDeclaredId.get(taskId) ?? []),
    ]),
  ];
  if (filenameMatches.length) return { task: null, strategy: 'FILENAME_HINT', bindingType: 'CANDIDATE_ONLY', resolution: 'CANDIDATE_ONLY', candidateTaskRefs: filenameMatches.map((task) => task.canonicalTaskRef) };
  return { task: null, strategy: null, bindingType: 'MISSING_TASK', resolution: 'MISSING_TASK', candidateTaskRefs: [] };
}

export function resolveReceiptBindings(receiptInventory, tasks) {
  const indexes = buildReceiptBindingIndexes(tasks);
  return receiptInventory.map((receipt) => {
    const binding = resolveReceiptBinding(receipt, indexes, tasks);
    const revisions = receipt.fields?.workspaceRevisions ?? [receipt.workspaceRevision].filter(Boolean);
    const sourceRevisions = receipt.fields?.sourceRevisions ?? [receipt.sourceRevision].filter(Boolean);
    return {
      uri: receipt.uri,
      schema: receipt.schema ?? null,
      evidenceId: receipt.evidenceId ?? receipt.fields?.evidenceIds?.[0] ?? null,
      bindingStrategy: binding.strategy,
      bindingType: binding.bindingType,
      resolution: binding.resolution,
      canonicalTaskRef: binding.task?.canonicalTaskRef ?? null,
      candidateTaskRefs: binding.candidateTaskRefs ?? [],
      canonicalSchemaValid: receipt.canonicalSchemaValid === true,
      workspaceRevision: revisions[0] ?? null,
      sourceRevision: sourceRevisions[0] ?? null,
      revisionStatus: revisions[0] && sourceRevisions[0] ? 'PRESENT' : 'MISSING_REVISION',
      proofEligible: receipt.canonicalSchemaValid === true && binding.resolution === 'BOUND' && ['BOUND_EXACT', 'BOUND_ALIAS', 'BOUND_SOURCE_REF'].includes(binding.bindingType),
    };
  });
}

function buildChangeRecords(root) {
  const roots = [
    { path: path.join(root, 'openspec', 'changes'), authorityScope: 'openspec://root' },
    { path: path.join(root, 'sveltekit-frontend', 'openspec', 'changes'), authorityScope: 'openspec://frontend' },
  ];
  const records = [];
  for (const { path: changesRoot, authorityScope } of roots) {
    if (!fs.existsSync(changesRoot)) continue;
    const changeDirs = [];
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const changeDir = path.join(directory, entry.name);
        if (fs.existsSync(path.join(changeDir, 'tasks.md'))) changeDirs.push(changeDir);
        else visit(changeDir);
      }
    };
    visit(changesRoot);
    for (const changeDir of changeDirs) {
      const tasksFile = path.join(changeDir, 'tasks.md');
      const changeId = path.basename(changeDir);
      const isArchived = relative(root, changeDir).split('/').includes('archive');
      const tasksPath = relative(root, tasksFile);
      const tasksMarkdown = readText(tasksFile);
      const tasks = parseTasksMarkdown(tasksMarkdown, changeId, tasksPath, authorityScope, isArchived);
      records.push({
        changeId,
        authorityScope,
        path: relative(root, changeDir),
        archived: isArchived,
        tasksPath,
        checklistRows: (tasksMarkdown.match(/^\s*[-*]\s+\[[ xX]\]/gm) ?? []).length,
        tasksHash: sha256(readText(tasksFile)),
        inventory: companionInventory(root, changeDir),
        tasks,
      });
    }
  }
  return records;
}

function sourceManifest(root) {
  const roots = [path.join(root, 'openspec', 'changes'), path.join(root, 'sveltekit-frontend', 'openspec', 'changes')];
  return roots.flatMap(listFiles)
    .map((file) => ({ source: relative(root, file), checksum: sha256(fs.readFileSync(file)) }))
    .sort((left, right) => left.source.localeCompare(right.source));
}

function readJsonIfPresent(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

function testReferences(root, change) {
  const references = new Set();
  for (const relativePath of change.inventory.paths) {
    if (!/\.md$/i.test(relativePath)) continue;
    const text = readText(path.join(root, relativePath));
    for (const match of text.matchAll(/(?:[A-Za-z0-9_@.$-]+\/)+[A-Za-z0-9_@.$-]+\.(?:test|spec)\.(?:ts|js|mjs|mts|py)/gi)) {
      references.add(match[0].replaceAll('\\', '/').replace(/^\.\//, ''));
    }
  }
  return [...references].sort().map((sourceRef) => ({
    sourceRef,
    exists: fs.existsSync(path.resolve(root, sourceRef)),
  }));
}

function portfolioInventoryIsCurrent(root, changes, inventory) {
  if (!Array.isArray(inventory?.changes)) return false;
  const active = changes.filter((change) => !change.archived);
  const previousByPath = new Map(inventory.changes.map((change) => [change.path, change]));
  if (active.length !== previousByPath.size || active.some((change) => !previousByPath.has(change.path))) return false;
  return active.every((change) => {
    const prior = previousByPath.get(change.path);
    const taskChecksum = sha256(fs.readFileSync(path.join(root, change.tasksPath))).slice(7);
    if (prior.taskChecksum !== taskChecksum) return false;
    const proposalPath = path.join(root, change.path, 'proposal.md');
    const proposalChecksum = fs.existsSync(proposalPath) ? sha256(fs.readFileSync(proposalPath)).slice(7) : null;
    if ((prior.proposalChecksum ?? null) !== proposalChecksum) return false;
    const directSpecFiles = listFiles(path.join(root, change.path, 'specs')).filter((file) => path.dirname(file) === path.join(root, change.path, 'specs') && path.extname(file).toLowerCase() === '.md');
    const priorSpecChecksums = Array.isArray(prior.specChecksums) ? prior.specChecksums : [];
    if (directSpecFiles.length !== priorSpecChecksums.length) return false;
    return directSpecFiles.every((file) => {
      const spec = priorSpecChecksums.find((entry) => entry.file === path.basename(file));
      return Boolean(spec) && spec.checksum === sha256(fs.readFileSync(file)).slice(7);
    });
  });
}

export function buildPortfolioCensus(root = DEFAULT_ROOT) {
  const commit = gitCommit(root);
  const changes = buildChangeRecords(root);
  const receiptIndex = indexReceipts(root);
  const receipts = receiptIndex.receipts;
  const taskRows = changes.flatMap((change) => change.tasks);
  const duplicateTaskGroups = classifyTaskDuplicates(taskRows);
  const duplicateTaskGroupCounts = Object.fromEntries([...new Set(duplicateTaskGroups.map((group) => group.classification))]
    .map((classification) => [classification, duplicateTaskGroups.filter((group) => group.classification === classification).length]));
  const dependencyCandidates = taskRows.flatMap(extractDependencyCandidates)
    .map((candidate) => resolveDependencyCandidate(candidate, taskRows));
  const dependencySyntax = inventoryDependencySyntax(taskRows, dependencyCandidates);
  const resolvedDependencyCandidates = dependencyCandidates.filter((candidate) => candidate.resolution === 'RESOLVED');
  const dependencies = resolvedDependencyCandidates
    .filter((candidate) => candidate.relation !== 'SUPERSEDES' && candidate.relation !== 'UNKNOWN')
    .map((candidate) => ({
      from: candidate.fromTaskKey,
      to: candidate.resolvedTaskKey,
      relation: candidate.relation,
      sourceRef: candidate.sourceRef,
      parser: candidate.parser,
    }));
  const missingTaskReferences = dependencyCandidates
    .filter((candidate) => candidate.resolution === 'MISSING_TARGET' || candidate.resolution === 'AMBIGUOUS' || candidate.resolution === 'PROPOSAL_ONLY')
    .map((candidate) => ({
      taskRef: candidate.sourceRef,
      fromTaskKey: candidate.fromTaskKey,
      reference: candidate.rawTarget,
      relation: candidate.relation,
      parser: candidate.parser,
      confidence: candidate.confidence,
      status: candidate.resolution,
      detail: candidate.resolutionDetail,
    }));
  const changeLevelReferences = dependencyCandidates
    .filter((candidate) => candidate.resolution === 'CHANGE_LEVEL_REFERENCE')
    .map((candidate) => ({
      taskRef: candidate.sourceRef,
      fromTaskKey: candidate.fromTaskKey,
      reference: candidate.rawTarget,
      relation: candidate.relation,
      parser: candidate.parser,
      referencedAuthorityScope: candidate.referencedAuthorityScope,
      referencedChangeId: candidate.referencedChangeId,
      status: candidate.resolution,
      detail: candidate.resolutionDetail,
    }));
  const cycles = detectCycles(dependencies.filter((candidate) => candidate.relation !== 'SUPERSEDES'));
  const cycleAffectedTaskKeys = new Set(cycles.flat());
  const cycleAffectedTasks = taskRows.filter((task) => task.dependencyCycleAffected || cycleAffectedTaskKeys.has(task.canonicalTaskRef)).map((task) => task.taskRef);
  const workspaceSourceManifest = sourceManifest(root);
  const workspaceRevision = sha256(canonicalJson(workspaceSourceManifest));
  const receiptInventory = [
    ...receipts.map((receipt) => ({ ...receipt, canonicalSchemaValid: true })),
    ...receiptIndex.historicalCandidates,
  ];
  const receiptBindings = resolveReceiptBindings(receiptInventory, taskRows);
  const tasksByCanonicalRef = new Map(taskRows.map((task) => [task.canonicalTaskRef, task]));
  const canonicalReceiptsByUri = new Map(receipts.map((receipt) => [receipt.uri, receipt]));
  const receiptMatches = receiptBindings.map((binding) => {
    const task = binding.canonicalTaskRef ? tasksByCanonicalRef.get(binding.canonicalTaskRef) : null;
    const receipt = canonicalReceiptsByUri.get(binding.uri);
    const sourceRefChecks = [];
    let taskSpanMatched = false;
    if (receipt && task) {
      for (const sourceRef of receipt.sourceRefs) {
        const relativeSource = typeof sourceRef.file === 'string' ? sourceRef.file.replaceAll('\\', '/') : '';
        const sourceFile = path.resolve(root, relativeSource);
        const pathFromRoot = path.relative(root, sourceFile);
        const withinRoot = pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !path.isAbsolute(pathFromRoot);
        const isTaskSource = relativeSource === task.tasksPath;
        const lineQualified = Number.isInteger(sourceRef.lineStart)
          && Number.isInteger(sourceRef.lineEnd)
          && task.sourceLine >= sourceRef.lineStart
          && task.sourceLine <= sourceRef.lineEnd;
        if (isTaskSource && lineQualified) taskSpanMatched = true;
        const fileRevision = withinRoot && fs.existsSync(sourceFile) ? sha256(fs.readFileSync(sourceFile)) : null;
        sourceRefChecks.push({
          file: relativeSource || null,
          current: Boolean(fileRevision && sourceRef.sourceRevision
            && (sourceRef.sourceRevision === fileRevision || (isTaskSource && sourceRef.sourceRevision === task.taskHash))),
          expectedRevision: sourceRef.sourceRevision ?? null,
          observedRevision: fileRevision,
        });
      }
    }
    const workspaceCurrent = Boolean(receipt && receipt.workspaceRevision === workspaceRevision);
    const sourceRefsCurrent = sourceRefChecks.length > 0 && sourceRefChecks.every((sourceRef) => sourceRef.current);
    const sourceCurrent = Boolean(receipt && task && receipt.sourceRevision === task.taskHash && taskSpanMatched && sourceRefsCurrent);
    return {
      ...binding,
      verdict: receipt?.verdict ?? null,
      observedAt: receipt?.observedAt ?? null,
      workspaceCurrent,
      sourceCurrent,
      sourceRefsCurrent,
      sourceRefChecks,
      taskSpanMatched,
      claim: receipt?.claim ?? null,
      actualAssertions: receipt?.actualAssertions ?? [],
      proofEligible: Boolean(binding.proofEligible && workspaceCurrent && sourceCurrent && receipt?.verdict),
    };
  });
  const parserAudit = buildParserGates({
    changes,
    tasks: taskRows,
    dependencySyntax,
    dependencies,
    receiptBindings,
    receipts,
    historicalCandidates: receiptIndex.historicalCandidates,
    duplicateGroups: duplicateTaskGroups,
  });
  const proofReceiptMatches = receiptMatches.filter((match) => match.proofEligible);
  const supersededEvidenceIds = new Set(receipts.map((receipt) => receipt.supersedesEvidenceId).filter(Boolean));
  const cards = taskRows.map((task) => {
    const matches = proofReceiptMatches.filter((receipt) => receipt.canonicalTaskRef === task.canonicalTaskRef);
    const activeMatches = matches.filter((receipt) => !supersededEvidenceIds.has(receipt.evidenceId));
    const latest = [...activeMatches].sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.evidenceId.localeCompare(right.evidenceId)).at(-1);
    const allBindings = receiptMatches.filter((receipt) => receipt.canonicalTaskRef === task.canonicalTaskRef);
    const hasUnqualifiedBinding = allBindings.length > 0 && !matches.length;
    const proofState = latest ? latest.verdict : hasUnqualifiedBinding ? 'STALE' : 'CLAIM_ONLY';
    const rejectionReasons = [];
    if (!allBindings.length) rejectionReasons.push('NO_BOUND_RECEIPT');
    if (allBindings.some((receipt) => receipt.bindingType === 'CANDIDATE_ONLY')) rejectionReasons.push('CANDIDATE_ONLY_BINDING');
    if (allBindings.some((receipt) => receipt.resolution === 'AMBIGUOUS')) rejectionReasons.push('IDENTITY_AMBIGUOUS');
    if (allBindings.some((receipt) => !receipt.workspaceCurrent)) rejectionReasons.push('WORKSPACE_REVISION_MISMATCH');
    if (allBindings.some((receipt) => !receipt.sourceCurrent || !receipt.taskSpanMatched)) rejectionReasons.push('SOURCE_REVISION_OR_SPAN_MISMATCH');
    if (!latest && allBindings.some((receipt) => !receipt.canonicalSchemaValid)) rejectionReasons.push('NON_CANONICAL');
    return buildEvidenceCardV1({
      schema: 'atlas.evidence-card.v1',
      taskRef: task.taskRef,
      changeId: task.changeId,
      taskId: task.taskId ?? task.taskKey,
      claim: task.taskText,
      proofState,
      retrievalUsable: true,
      proofUsable: proofState === 'PROVEN',
      rejectionReasons: [...new Set(rejectionReasons)],
      sourceRef: task.taskRef,
      conceptID: `openspec:${task.changeId}:${task.taskKey}`,
      confidenceScore: proofState === 'PROVEN' ? 1 : proofState === 'STALE' ? 0.25 : 0,
      contextBlob: `${proofState}: ${task.taskText}`.slice(0, 2000),
      evidenceIds: allBindings.map((receipt) => receipt.evidenceId).filter(Boolean),
      workspaceRevision,
    });
  });
  const cardByRef = new Map(cards.map((card) => [card.taskRef, card]));
  const checkedWithEvidence = taskRows.filter((task) => task.declaredChecked && cardByRef.get(task.taskRef)?.proofState === 'PROVEN').length;
  const checkedWithoutEvidence = taskRows.filter((task) => task.declaredChecked && cardByRef.get(task.taskRef)?.proofState !== 'PROVEN').length;
  const uncheckedButProven = taskRows.filter((task) => !task.declaredChecked && cardByRef.get(task.taskRef)?.proofState === 'PROVEN').length;
  const requirements = changes.flatMap((change) => change.inventory.requirements.map((requirement) => ({ changeRef: change.changeRef ?? change.path, ...requirement })));
  const testInventory = changes.map((change) => ({
    changeRef: change.path,
    colocatedTestFiles: change.inventory.testFiles ?? [],
    explicitTestReferences: testReferences(root, change),
  }));
  const supersessionAudit = readJsonIfPresent(path.join(root, 'docs/reports/openspec-supersession-audit-v1.json'));
  const portfolioRelations = readJsonIfPresent(path.join(root, 'docs/reports/openspec-portfolio-relations-v2.json'));
  const portfolioInventory = readJsonIfPresent(path.join(root, 'docs/reports/openspec-portfolio-inventory-v2.json'));
  const currentActivePaths = changes.filter((change) => !change.archived).map((change) => change.path).sort();
  const ownerConflictsCurrent = portfolioInventoryIsCurrent(root, changes, portfolioInventory);
  const supersessionAuditCurrent = false;
  const supersessionCandidates = changes.filter((change) => !change.archived).flatMap((change) => {
    const markdownPaths = change.inventory.paths.filter((file) => /\.md$/i.test(file));
    return markdownPaths.flatMap((file) => readText(path.join(root, file)).split(/\r?\n/)
      .map((line, index) => /\b(?:SUPERSEDED BY|SUPERSEDES|REPLACED BY|MOVED TO)\b/i.test(line)
        ? { changeRef: change.changeRef ?? change.path, sourceRef: `${file}#L${index + 1}`, text: line.trim().slice(0, 240) }
        : null)
      .filter(Boolean));
  });
  const report = {
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    generatedAt: new Date().toISOString(),
    source: {
      root: '.',
      gitCommit: commit,
      workspaceRevision,
      workspaceRevisionScope: 'checksums of all files under both OpenSpec changes roots, including archives',
      sourceFileCount: workspaceSourceManifest.length,
      environmentFingerprint: sha256(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch })),
      taskAuthority: 'openspec/changes/*/tasks.md',
      proofStateAuthority: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
    },
    summary: {
      totalChanges: changes.length,
      activeChanges: changes.filter((change) => !change.archived).length,
      archivedChanges: changes.filter((change) => change.archived).length,
      totalTasks: taskRows.length,
      checkedTasks: taskRows.filter((task) => task.declaredChecked).length,
      uncheckedTasks: taskRows.filter((task) => !task.declaredChecked).length,
      checkedWithEvidence,
      checkedWithoutEvidence,
      uncheckedButProven,
      taskIdMissing: taskRows.filter((task) => task.taskId === null).length,
      tasks_total: taskRows.length,
      explicit_task_ids: taskRows.filter((task) => task.taskIdentity.identityState === 'DECLARED_ID').length,
      derived_task_ids: taskRows.filter((task) => task.taskIdentity.identityState === 'DERIVED_ID').length,
      ambiguous_task_identities: taskRows.filter((task) => task.taskIdentity.identityState === 'AMBIGUOUS').length,
      invalid_task_identities: taskRows.filter((task) => task.taskIdentity.identityState === 'INVALID').length,
      duplicate_declared_ids: duplicateTaskGroups.filter((group) => group.classification.startsWith('DUPLICATE_DECLARED_ID')).length,
      duplicate_derived_keys: duplicateTaskGroups.filter((group) => group.classification === 'DUPLICATE_DERIVED_KEY').length,
      duplicateTaskIds: duplicateTaskGroups.length,
      duplicateTaskGroupCounts,
      receipts_total: receiptInventory.length,
      receiptCount: receipts.length,
      invalidReceiptCount: receiptIndex.invalidReceipts.length,
      untypedReceiptCandidateCount: receiptIndex.historicalCandidates.length,
      matchedReceiptCount: receiptBindings.filter((binding) => binding.resolution === 'BOUND').length,
      orphanReceiptCount: receiptBindings.filter((binding) => binding.resolution === 'MISSING_TASK').length,
      bound_exact: receiptBindings.filter((binding) => binding.bindingType === 'BOUND_EXACT').length,
      bound_alias: receiptBindings.filter((binding) => binding.bindingType === 'BOUND_ALIAS').length,
      bound_source_ref: receiptBindings.filter((binding) => binding.bindingType === 'BOUND_SOURCE_REF').length,
      candidate_only: receiptBindings.filter((binding) => binding.bindingType === 'CANDIDATE_ONLY').length,
      ambiguous_receipts: receiptBindings.filter((binding) => binding.resolution === 'AMBIGUOUS').length,
      missing_task_receipts: receiptBindings.filter((binding) => binding.resolution === 'MISSING_TASK').length,
      missing_revision_receipts: receiptBindings.filter((binding) => binding.revisionStatus === 'MISSING_REVISION').length,
      invalid_schema_receipts: receiptIndex.invalidReceipts.filter((receipt) => receipt.failureKind === 'INVALID_SCHEMA').length,
      checksum_failed_receipts: receiptIndex.invalidReceipts.filter((receipt) => receipt.failureKind === 'CHECKSUM_FAILED').length,
      unreadableReceiptCandidates: receiptIndex.unreadableCandidates,
      oversizedReceiptCandidates: receiptIndex.oversizedCandidates,
      dependencyCount: dependencies.length,
      dependency_candidates: dependencyCandidates.length,
      resolved_edges: dependencies.length,
      dependencyMissingTaskReferenceCount: missingTaskReferences.filter((reference) => reference.status === 'MISSING_TARGET').length,
      dependencyAmbiguousReferenceCount: missingTaskReferences.filter((reference) => reference.status === 'AMBIGUOUS').length,
      dependencyProposalOnlyCount: missingTaskReferences.filter((reference) => reference.status === 'PROPOSAL_ONLY').length,
      dependencyChangeLevelReferenceCount: changeLevelReferences.length,
      dependencyCycleAffectedTaskCount: cycleAffectedTasks.length,
      requirementCount: requirements.length,
      changesWithTests: testInventory.filter((entry) => entry.colocatedTestFiles.length > 0 || entry.explicitTestReferences.length > 0).length,
      explicitTestReferenceCount: testInventory.reduce((count, entry) => count + entry.explicitTestReferences.length, 0),
      existingTestReferenceCount: testInventory.reduce((count, entry) => count + entry.explicitTestReferences.filter((reference) => reference.exists).length, 0),
      missingTestReferenceCount: testInventory.reduce((count, entry) => count + entry.explicitTestReferences.filter((reference) => !reference.exists).length, 0),
      tasksWithoutDependencyMetadata: taskRows.filter((task) => task.declaredDependencies === null).length,
      staleEvidenceCount: cards.filter((card) => card.proofState === 'STALE').length,
      supersessionCandidateCount: supersessionCandidates.length,
      ownerConflictCandidateCount: ownerConflictsCurrent ? portfolioRelations?.summary?.ownerCollisionCount ?? 0 : null,
      staleOwnerConflictCandidateCount: ownerConflictsCurrent ? 0 : portfolioRelations?.summary?.ownerCollisionCount ?? null,
      ownerConflictAuditCurrent: ownerConflictsCurrent,
      censusStatus: parserAudit.censusStatus,
      promotionEligible: parserAudit.promotionEligible,
    },
    changes,
    tasks: taskRows,
    duplicateTaskIdGroups: duplicateTaskGroups,
    evidenceReceipts: receipts,
    invalidEvidenceReceipts: receiptIndex.invalidReceipts,
    historicalReceiptCandidates: receiptIndex.historicalCandidates,
    receiptBindings,
    evidenceMatches: receiptMatches,
    proofEligibleReceiptMatches: proofReceiptMatches,
    staleEvidenceMatches: receiptMatches.filter((match) => match.canonicalSchemaValid && match.resolution === 'BOUND' && (!match.workspaceCurrent || !match.sourceCurrent || !match.taskSpanMatched)),
    dependencies,
    dependencyCandidates,
    dependencySyntaxInventory: dependencySyntax,
    missingTaskReferences,
    changeLevelReferences,
    dependencyCycles: cycles,
    dependencyCycleAffectedTasks: cycleAffectedTasks,
    parserAudit,
    requirements,
    testInventory,
    supersession: {
      freshness: supersessionAuditCurrent ? 'CURRENT' : 'STALE_OR_UNVERIFIABLE',
      sourceReport: 'docs/reports/openspec-supersession-audit-v1.json',
      generatedAt: supersessionAudit?.generatedAt ?? null,
      supersededChanges: [],
      candidates: supersessionCandidates,
    },
    ownerConflicts: {
      freshness: ownerConflictsCurrent ? 'CURRENT' : 'STALE_OR_UNVERIFIABLE',
      sourceReport: 'docs/reports/openspec-portfolio-relations-v2.json',
      generatedAt: portfolioRelations?.generatedAt ?? null,
      candidates: ownerConflictsCurrent ? portfolioRelations?.ownerCollisions ?? [] : [],
      staleCandidateCount: ownerConflictsCurrent ? 0 : portfolioRelations?.summary?.ownerCollisionCount ?? null,
    },
    evidenceCards: cards,
    invariants: [
      '[x] is a claim, not proof.',
      'PROVEN requires a schema-valid, checksum-verified receipt at the current workspace and task-source revisions.',
      'PROVEN requires satisfied assertions, an independent verifier, and required readback.',
      'Generated workboards and evidence cards are projections, not task authority.',
      'No task checkbox or external projection is mutated by this census.',
    ],
    sideEffects: { sourceFilesMutated: false, persistentStoresMutated: false },
    likely_cause: 'OpenSpec claims and proof artifacts are distributed across task ledgers, source files, tests, and reports.',
    patch_targets: ['scripts/atlas/audit-openspec-evidence-fabric-v1.mjs', 'packages/semantic-contracts/src/openspec-evidence-fabric-v1.ts'],
    safe_next_command: 'npx tsx scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only',
    smoke_command: 'npx tsx --test scripts/atlas/audit-openspec-evidence-fabric-v1.test.mjs',
    report_path: 'docs/reports/openspec-evidence/<run-id>/census-v1.json',
  };
  return report;
}

function sealReport(value) {
  const { checksum: _checksum, ...unsigned } = value;
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

function buildRunArtifacts(report, runId) {
  const shared = {
    runId,
    generatedAt: report.generatedAt,
    gitCommit: report.source.gitCommit,
    workspaceRevision: report.source.workspaceRevision,
    environmentFingerprint: report.source.environmentFingerprint,
  };
  return [
    ['census-v1.json', sealReport({ ...report, ...shared })],
    ['parser-diagnostics-v1.json', sealReport({
      schema: 'atlas.openspec-parser-diagnostics.v1',
      ...shared,
      censusStatus: report.parserAudit.censusStatus,
      promotionEligible: false,
      parserGates: report.parserAudit.parserGates,
      additionalBlockingStatuses: report.parserAudit.additionalBlockingStatuses,
      identity: {
        tasks_total: report.summary.tasks_total,
        explicit_task_ids: report.summary.explicit_task_ids,
        derived_task_ids: report.summary.derived_task_ids,
        ambiguous_task_identities: report.summary.ambiguous_task_identities,
        invalid_task_identities: report.summary.invalid_task_identities,
        duplicate_declared_ids: report.summary.duplicate_declared_ids,
        duplicate_derived_keys: report.summary.duplicate_derived_keys,
        duplicateGroups: report.duplicateTaskIdGroups,
      },
      dependencySyntaxInventory: report.dependencySyntaxInventory,
    })],
    ['receipt-binding-v1.json', sealReport({
      schema: 'atlas.openspec-receipt-binding-diagnostics.v1',
      ...shared,
      promotionEligible: false,
      summary: Object.fromEntries(Object.entries(report.summary).filter(([key]) => /receipt|bound_|candidate_only|ambiguous_receipts|missing_task_receipts/i.test(key))),
      canonicalReceipts: report.evidenceReceipts,
      historicalCandidates: report.historicalReceiptCandidates,
      invalidReceipts: report.invalidEvidenceReceipts,
      bindings: report.receiptBindings,
      proofEligibleBindings: report.proofEligibleReceiptMatches,
    })],
    ['dependency-resolution-v1.json', sealReport({
      schema: 'atlas.openspec-dependency-resolution-diagnostics.v1',
      ...shared,
      promotionEligible: false,
      summary: {
        candidates: report.summary.dependency_candidates,
        resolvedEdges: report.summary.resolved_edges,
        missingTargets: report.summary.dependencyMissingTaskReferenceCount,
        ambiguousTargets: report.summary.dependencyAmbiguousReferenceCount,
        cycles: report.dependencyCycles.length,
      },
      syntaxInventory: report.dependencySyntaxInventory,
      candidates: report.dependencyCandidates,
      resolvedEdges: report.dependencies,
      unresolvedCandidates: report.missingTaskReferences,
      cycles: report.dependencyCycles,
    })],
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const requestedRoot = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const root = path.resolve(requestedRoot ?? DEFAULT_ROOT);
  const report = buildPortfolioCensus(root);
  const runId = process.env.OPENSPEC_EVIDENCE_RUN_ID
    ?? `${report.generatedAt.replace(/\D/g, '').slice(0, 17)}-${report.source.workspaceRevision.slice(7, 19)}`;
  const runDirectory = process.env.OPENSPEC_EVIDENCE_RUN_DIR
    ? path.resolve(root, process.env.OPENSPEC_EVIDENCE_RUN_DIR)
    : path.join(root, DEFAULT_REPORT_ROOT, runId);
  report.runId = runId;
  report.report_path = relative(root, path.join(runDirectory, 'census-v1.json'));
  const artifacts = buildRunArtifacts(report, runId);
  if (!process.argv.includes('--check-only')) {
    fs.mkdirSync(runDirectory, { recursive: true });
    for (const [fileName, artifact] of artifacts) {
      const outputPath = path.join(runDirectory, fileName);
      const descriptor = fs.openSync(outputPath, 'wx');
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      } finally {
        fs.closeSync(descriptor);
      }
    }
  }
  console.log(JSON.stringify({
    schema: report.schema,
    runId,
    censusStatus: report.parserAudit.censusStatus,
    summary: report.summary,
    workspaceRevision: report.source.workspaceRevision,
    outputs: process.argv.includes('--check-only') ? [] : artifacts.map(([fileName]) => path.join(runDirectory, fileName)),
  }, null, 2));
}
