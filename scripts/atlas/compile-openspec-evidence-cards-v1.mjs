import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BINDINGS_PATH = process.env.OPENSPEC_EVIDENCE_BINDINGS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_BINDINGS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-task-evidence-bindings-v1.json');
const OUTPUT_PATH = process.env.OPENSPEC_EVIDENCE_CARDS_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_CARDS_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-cards-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function compactContext({ task, binding, predicates }) {
  const predicateText = predicates.map((predicate) => `${predicate.status}:${predicate.text}`).join(' | ');
  const dependencyText = binding.dependencyRefs.map((dependency) => `${dependency.relation}:${dependency.taskRef}`).join(', ') || 'none';
  const blockerText = binding.blockers.map((blocker) => blocker.reference ?? blocker.type ?? blocker.status).join(', ') || 'none';
  const receiptText = binding.evidenceIds.join(', ') || 'none';
  const raw = `TASK ${binding.taskId} CHANGE ${binding.changeId} STATE ${binding.proofState}. CLAIM ${task.taskText} PREDICATES ${predicateText || 'none'} DEPENDENCIES ${dependencyText} BLOCKERS ${blockerText} RECEIPTS ${receiptText} REVISION workspace=${binding.workspaceRevision} source=${binding.sourceRevision}. RECEIPTS, not this card, establish proof.`;
  return raw.slice(0, 1600);
}

export function compileOpenSpecEvidenceCardsV1(bindingsReport) {
  if (bindingsReport?.schema !== 'atlas.openspec-task-evidence-bindings.v1') throw new Error('BINDINGS_SCHEMA_UNSUPPORTED');
  const censusPath = process.env.OPENSPEC_CENSUS_PATH
    ? path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)
    : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-portfolio-census-v2.json');
  const censusRef = path.relative(ROOT, censusPath).replaceAll('\\', '/');
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const expectedRunId = process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null;
  if (expectedRunId && bindingsReport.runId !== expectedRunId) throw new Error('CARD_BINDINGS_RUN_ID_MISMATCH');
  if (!census.source?.workspaceRevision || bindingsReport.source?.workspaceRevision !== census.source.workspaceRevision) {
    throw new Error('CARD_BINDINGS_REVISION_MISMATCH');
  }
  const tasksByRef = new Map((census.tasks ?? []).map((task) => [task.taskRef, task]));
  const predicatesByTask = new Map();
  for (const predicate of bindingsReport.predicates ?? []) {
    const rows = predicatesByTask.get(predicate.taskRef) ?? [];
    rows.push(predicate);
    predicatesByTask.set(predicate.taskRef, rows);
  }
  const cards = (bindingsReport.bindings ?? []).map((binding) => {
    const task = tasksByRef.get(binding.taskRef);
    if (!task) throw new Error(`TASK_NOT_FOUND_FOR_BINDING:${binding.taskRef}`);
    const predicates = (predicatesByTask.get(binding.taskRef) ?? []).slice(0, 20);
    const contextBlob = compactContext({ task, binding, predicates });
    const unsigned = {
      schema: 'atlas.openspec-evidence-card.v1',
      cardId: sha256(`${binding.taskRef}\0${binding.workspaceRevision}\0${binding.sourceRevision}`),
      taskIdentity: {
        taskRef: binding.taskRef,
        taskId: binding.taskId,
        changeId: binding.changeId,
        canonicalTaskRef: task.canonicalTaskRef,
        authorityScope: task.authorityScope,
        archived: task.archived,
        identityState: task.taskIdentity?.identityState ?? null,
      },
      claim: task.taskText,
      predicates: predicates.map((predicate) => ({ predicateId: predicate.predicateId, status: predicate.status, text: predicate.text })),
      proofState: binding.proofState,
      proofAuthority: 'RECEIPT_ONLY',
      blockers: binding.blockers,
      contradictions: binding.contradictions,
      dependencyRefs: binding.dependencyRefs,
      receiptRefs: binding.evidenceIds,
      sourceRefs: [binding.taskRef],
      revisions: { workspaceRevision: binding.workspaceRevision, sourceRevision: binding.sourceRevision },
      contextBlob,
      tokenEstimate: Math.ceil(contextBlob.length / 4),
      tokenBudget: { min: 150, max: 400 },
      budgetStatus: Math.ceil(contextBlob.length / 4) < 150 ? 'UNDER_TARGET' : Math.ceil(contextBlob.length / 4) <= 400 ? 'WITHIN_TARGET' : 'OVER_TARGET',
      retrievalUsable: true,
      proofUsable: false,
    };
    return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
  });
  const unsigned = {
    schema: 'atlas.openspec-evidence-cards.v1',
    runId: expectedRunId,
    generatedAt: new Date().toISOString(),
    source: {
      census: censusRef,
      bindings: path.relative(ROOT, BINDINGS_PATH).replaceAll('\\', '/'),
      workspaceRevision: bindingsReport.source?.workspaceRevision ?? null,
      canonicalAuthority: false,
    },
    summary: {
      cardCount: cards.length,
      proofStateCounts: Object.fromEntries([...new Set(cards.map((card) => card.proofState))].sort().map((state) => [state, cards.filter((card) => card.proofState === state).length])),
      withinTargetCount: cards.filter((card) => card.budgetStatus === 'WITHIN_TARGET').length,
      underTargetCount: cards.filter((card) => card.budgetStatus === 'UNDER_TARGET').length,
      overTargetCount: cards.filter((card) => card.budgetStatus === 'OVER_TARGET').length,
      proofUsableCount: cards.filter((card) => card.proofUsable).length,
    },
    cards,
    invariants: [
      'Cards are bounded retrieval artifacts and never replace receipts as proof authority.',
      'Card regeneration is revision-bound and checksum-addressed.',
      'Receipt refs, source refs, dependencies, blockers, and contradictions remain explicit.',
    ],
    sideEffects: { taskLedgersMutated: false, receiptsMutated: false, persistentStoresMutated: false },
    likely_cause: 'Raw task and receipt records are too large and disconnected for bounded ACE retrieval.',
    evidence: [path.relative(ROOT, BINDINGS_PATH).replaceAll('\\', '/'), censusRef],
    patch_targets: ['scripts/atlas/compile-openspec-evidence-cards-v1.mjs'],
    safe_next_command: 'node scripts/atlas/compile-openspec-evidence-cards-v1.mjs',
    smoke_command: 'node --check scripts/atlas/compile-openspec-evidence-cards-v1.mjs',
    report_path: path.relative(ROOT, OUTPUT_PATH).replaceAll('\\', '/'),
  };
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const bindings = JSON.parse(fs.readFileSync(BINDINGS_PATH, 'utf8'));
  const report = compileOpenSpecEvidenceCardsV1(bindings);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, summary: report.summary, workspaceRevision: report.source.workspaceRevision, checksum: report.checksum, output: OUTPUT_PATH }, null, 2));
}
