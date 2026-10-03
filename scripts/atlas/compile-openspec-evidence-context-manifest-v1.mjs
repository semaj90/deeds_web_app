import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const cardsPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-cards-v1.json');
const retrievalPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-hybrid-rrf-audit-v1.json');
const outputPath = process.env.OPENSPEC_CONTEXT_MANIFEST_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_CONTEXT_MANIFEST_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-context-manifest-v1.json');
const requestedTaskIds = new Set((process.env.OPENSPEC_CONTEXT_TASK_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
const maxCards = Math.max(1, Math.min(32, Number(process.env.OPENSPEC_CONTEXT_MAX_CARDS ?? 8)));
const maxBytes = Math.max(1024, Math.min(200_000, Number(process.env.OPENSPEC_CONTEXT_MAX_BYTES ?? 32_000)));

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function main() {
  const cardsReport = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  const retrievalReport = JSON.parse(fs.readFileSync(retrievalPath, 'utf8'));
  const selected = requestedTaskIds.size === 0
    ? []
    : cardsReport.cards.filter((card) => requestedTaskIds.has(card.taskId)).slice(0, maxCards);
  const missingTaskIds = [...requestedTaskIds].filter((taskId) => !cardsReport.cards.some((card) => card.taskId === taskId));
  const retrievalProven = retrievalReport.status === 'RRF_OWNER_RUNTIME_PROVEN';
  const cards = selected.map((card) => ({
    sourceRef: card.taskRef,
    ConceptID: card.taskId,
    ConfidenceScore: card.proofState === 'PROVEN' ? 1 : card.proofState === 'PARTIAL' ? 0.5 : 0,
    ContextBlob: card.contextBlob,
    cardChecksum: card.checksum,
    workspaceRevision: card.workspaceRevision,
    sourceRevision: card.sourceRevision,
    proofState: card.proofState,
  }));
  const contextBytes = Buffer.byteLength(JSON.stringify(cards), 'utf8');
  const queryPlanRevision = checksum({ retrieval: retrievalReport.checksum, maxCards, maxBytes });
  const unsigned = {
    schema: 'atlas.openspec-evidence-context-manifest.v1',
    mode: 'READ_ONLY_ACE_MANIFEST_COMPILATION',
    status: !retrievalProven ? 'BLOCKED_RETRIEVAL_GATE' : missingTaskIds.length ? 'BLOCKED_MISSING_TASK_IDS' : contextBytes > maxBytes ? 'BLOCKED_CONTEXT_BUDGET' : 'CONTEXT_MANIFEST_READY_NO_REDIS_WRITE',
    source: { cards: relative(cardsPath), retrievalAudit: relative(retrievalPath), workspaceRevision: cardsReport.source.workspaceRevision },
    selection: { requestedTaskIds: [...requestedTaskIds], selectedTaskCount: cards.length, missingTaskIds, maxCards, maxBytes, contextBytes },
    cards,
    queryPlanRevision,
    manifestChecksumInputs: { cardChecksums: cards.map((card) => card.cardChecksum), workspaceRevision: cardsReport.source.workspaceRevision, queryPlanRevision },
    policy: {
      rawDocumentsInjected: false,
      sourceRefRequired: true,
      conceptIdRequired: true,
      confidenceScoreRequired: true,
      contextBlobRequired: true,
      dependencyExpansionBudget: 0,
      receiptPromotionBudget: 0,
      redisWrites: false,
      proofStatePromotion: false,
    },
    writesPerformed: false,
    likely_cause: 'ACE must receive bounded, revision-qualified EvidenceCards rather than raw retrieval hits or documents.',
    evidence: [relative(cardsPath), relative(retrievalPath)],
    patch_targets: ['scripts/atlas/compile-openspec-evidence-context-manifest-v1.mjs'],
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-hybrid-rrf-v1.mjs',
    smoke_command: 'node --check scripts/atlas/compile-openspec-evidence-context-manifest-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, selectedTaskCount: cards.length, contextBytes, writesPerformed: false, output: outputPath }, null, 2));
}

main();
