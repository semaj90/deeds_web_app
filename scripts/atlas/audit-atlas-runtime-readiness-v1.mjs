#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sha256, semanticChecksum, object, array, string } from './lib/stable-json.mjs';
import { gate, auditState } from './lib/audit-state.mjs';

const repoRoot = path.resolve(process.argv[2] ?? process.cwd());
const reportsDir = path.resolve(process.argv[3] ?? path.join(repoRoot, 'docs/reports'));
const outputPath = path.resolve(process.argv[4] ?? path.join(reportsDir, 'atlas-runtime-readiness-v1.json'));
const fallbackReportsDir = path.basename(reportsDir).toLowerCase() === 'staging' ? path.dirname(reportsDir) : path.join(reportsDir, 'staging');

function resolveRepoFile(rel) {
  const direct = path.join(repoRoot, rel);
  if (fs.existsSync(direct)) return direct;
  // Awareness fixtures historically place the repo under a web-app/ wrapper.
  const wrapped = path.join(repoRoot, 'web-app', rel);
  return fs.existsSync(wrapped) ? wrapped : direct;
}
function exists(rel) { try { return fs.statSync(resolveRepoFile(rel)).isFile(); } catch { return false; } }
function readJson(name) { for (const dir of [reportsDir, fallbackReportsDir]) { try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch {} } return null; }
function text(name) { try { return fs.readFileSync(resolveRepoFile(name), 'utf8'); } catch { return ''; } }
function reportExists(name) { return [reportsDir, fallbackReportsDir].some((dir) => fs.existsSync(path.join(dir, name))); }
function anyReport(re) { return [...new Set([reportsDir, fallbackReportsDir].flatMap((dir) => { try { return fs.readdirSync(dir).filter((x) => re.test(x)); } catch { return []; } }))].sort(); }
function deepHas(value, regex, depth=0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string') return regex.test(value);
  if (Array.isArray(value)) return value.some((v) => deepHas(v, regex, depth+1));
  if (typeof value === 'object') return Object.entries(value).some(([k,v]) => regex.test(k) || deepHas(v, regex, depth+1));
  return false;
}
function reportEvidence(re, predicate = null) {
  const out = [];
  for (const name of anyReport(re)) {
    const parsed = readJson(name);
    if (!predicate || (parsed && predicate(parsed))) out.push(`report:${name}`);
  }
  return out;
}
function deepHasAll(value, patterns) { return patterns.every((pattern) => deepHas(value, pattern)); }

const controller = readJson('openspec-execution-controller-v1.json');
const ann = readJson('semantic768-qdrant-cuvs-identity-v2.json');
const blocker = readJson('openspec-blocker-audit-v1.json');
const directoryGraph = readJson('openspec-directory-graph-v1.json');

const canonicalBlocked = deepHas(controller, /WAITING_ON_AUTHORITY|CURRENT_SOURCE_AUTHORITY|CANONICAL_AUTHORIZATION/i) || deepHas(blocker, /CURRENT_SOURCE_AUTHORITY|CANONICAL_AUTHORIZATION/i);
const freezeBlocked = deepHas(controller, /CANDIDATE_POPULATION_FREEZE/i) || deepHas(blocker, /CANDIDATE_POPULATION_FREEZE/i);
const annFixtureProven = Boolean(ann && deepHas(ann, /same.*(identity|matrix).*true|fixture/i));
const annLiveProven = Boolean(ann && deepHas(ann, /live.*(parity|readback).*proven/i) && !deepHas(ann, /blocked/i));

const qdrantSchemaEvidence = reportEvidence(/qdrant.*(schema|payload|capability|collection|index).*\.json$/i, (r) =>
  deepHasAll(r, [/qdrant|collection/i, /vector|dimension|size/i, /payload|schema|index/i])
);
const qdrantTagEvidence = reportEvidence(/qdrant.*(tag|payload|lineage|identity).*\.json$/i, (r) =>
  deepHasAll(r, [/packet[_ -]?key/i, /symbol[_ -]?version[_ -]?id/i, /workspace[_ -]?revision/i, /source[_ -]?revision/i, /representation[_ -]?(id|revision)/i, /readback|observed|payload/i])
);
const valkeyEvidence = reportEvidence(/(valkey|redis).*(centroid|cache|warm|residency).*\.json$/i, (r) =>
  deepHasAll(r, [/valkey|redis/i, /centroid/i, /readback|hit|stored|loaded|warm/i])
);
const bitfrostEvidence = reportEvidence(/bitfrost.*(warm|bucket|cache|residency).*\.json$/i, (r) =>
  deepHasAll(r, [/bitfrost/i, /bucket/i, /warm/i, /readback|hit|resident|loaded/i])
);
const aceEvidence = reportEvidence(/ace.*(packet|residency|feature|policy|warm).*\.json$/i, (r) =>
  deepHasAll(r, [/ace/i, /packet|candidate/i, /evidence|receipt/i, /revision|canonical/i])
);
const prefillEvidence = reportEvidence(/(prefill|contextmanifest|promptplan).*(proof|receipt|readiness).*\.json$/i, (r) =>
  deepHasAll(r, [/context.?manifest/i, /prompt.?plan|prefill/i, /checksum|revision/i, /evidence|receipt|proven/i])
);
const acpEvidence = reportEvidence(/acp.*(capability|transport|proof|receipt).*\.json$/i, (r) =>
  deepHasAll(r, [/\bacp\b/i, /health|capability|catalog/i, /healthy|proven|success|pass/i])
);
const a2aEvidence = reportEvidence(/a2a.*(capability|transport|proof|receipt).*\.json$/i, (r) =>
  deepHasAll(r, [/\ba2a\b/i, /health|capability|catalog/i, /healthy|proven|success|pass/i])
);
const humanEvidence = reportEvidence(/human.*(approval|feedback|decision|receipt).*\.json$/i, (r) =>
  deepHasAll(r, [/decision|approval|preference/i, /evidence.?hash|evidence.?refs/i, /task.?id/i])
);
const trainingEvidence = reportEvidence(/(pytorch|torch|reinforcement|rlhf|reward|preference).*(training|eval|receipt).*\.json$/i, (r) =>
  deepHasAll(r, [/model|head|policy/i, /eval|accuracy|loss|metric/i, /revision|checksum|seed/i])
);

// A transport/configuration audit is not an adapter runtime proof. Require an
// explicit runtime/handshake/capability signal and reject receipts that contain
// failed proof-of-life output (for example 0/5 subjects passed or HTTP 503).
// This keeps protocol readiness fail-closed while still allowing a future
// revisioned ACP/A2A health receipt to qualify.
function protocolRuntimeEvidence(protocol) {
  const protocolPattern = new RegExp(`\\b${protocol}\\b`, 'i');
  return reportEvidence(new RegExp(`${protocol}.*(capability|transport|proof|receipt).*\\.json$`, 'i'), (r) => {
    const hasRuntimeSignal = deepHasAll(r, [protocolPattern, /runtime|handshake|proof[-_ ]?of[-_ ]?life|probe/i, /health|capability|catalog/i, /proven|success|healthy|passed/i]);
    const hasFailureSignal = deepHas(r, /0\s*\/\s*\d+|\b503\b|UNPROVEN|NOT[_ -]?PROVEN|PROOF[_ -]?MISSING|HANDLER[S _-]?MISSING|FAIL(?:ED|URE)?/i);
    return hasRuntimeSignal && !hasFailureSignal;
  });
}

const acpRuntimeEvidence = protocolRuntimeEvidence('acp');
const a2aRuntimeEvidence = protocolRuntimeEvidence('a2a');

const sourceFiles = {
  agentAdapters: 'sveltekit-frontend/src/lib/server/atlas/agent-adapters.ts',
  transport: 'sveltekit-frontend/src/lib/server/atlas/transport.ts',
  contextManifest: 'sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts',
  taskState: 'sveltekit-frontend/src/lib/server/atlas/task-state.ts',
  workflowStore: 'sveltekit-frontend/src/lib/server/atlas/workflow-store.ts'
};
const contracts = Object.fromEntries(Object.entries(sourceFiles).map(([k,v]) => [k, exists(v)]));
const agentAdapterText = text(sourceFiles.agentAdapters);

const gates = [
  gate('CANONICAL_LINEAGE_READY', auditState({ proven: !canonicalBlocked && Boolean(controller), waiting: canonicalBlocked, partial: Boolean(controller) }), ['report:openspec-execution-controller-v1.json'], canonicalBlocked ? ['CURRENT_SOURCE_AUTHORITY_OR_AUTHORIZATION'] : []),
  gate('QDRANT_COLLECTION_SCHEMA_PROVEN', auditState({ proven: qdrantSchemaEvidence.length > 0, partial: annFixtureProven }), [...qdrantSchemaEvidence, ...(annFixtureProven ? ['report:semantic768-qdrant-cuvs-identity-v2.json'] : [])], qdrantSchemaEvidence.length ? [] : ['QDRANT_SCHEMA_RECEIPT_MISSING']),
  gate('QDRANT_LINEAGE_TAGS_PROVEN', auditState({ proven: qdrantTagEvidence.length > 0 && !canonicalBlocked, waiting: canonicalBlocked, partial: qdrantTagEvidence.length > 0 }), qdrantTagEvidence, canonicalBlocked ? ['CURRENT_LINEAGE_NOT_AUTHORITATIVE'] : (qdrantTagEvidence.length ? [] : ['QDRANT_TAG_READBACK_MISSING'])),
  gate('ANN03_LIVE_PARITY_PROVEN', auditState({ proven: annLiveProven, waiting: freezeBlocked || canonicalBlocked, partial: annFixtureProven }), ann ? ['report:semantic768-qdrant-cuvs-identity-v2.json'] : [], [...(freezeBlocked ? ['CANDIDATE_POPULATION_FREEZE'] : []), ...(canonicalBlocked ? ['CURRENT_LINEAGE_NOT_AUTHORITATIVE'] : [])]),
  gate('VALKEY_CENTROID_CACHE_PROVEN', auditState({ proven: valkeyEvidence.length > 0 }), valkeyEvidence, valkeyEvidence.length ? [] : ['VALKEY_CENTROID_RECEIPT_MISSING']),
  gate('BITFROST_BUCKET_WARMING_PROVEN', auditState({ proven: bitfrostEvidence.length > 0 }), bitfrostEvidence, bitfrostEvidence.length ? [] : ['BITFROST_WARMING_RECEIPT_MISSING']),
  gate('ACE_PACKET_READINESS_PROVEN', auditState({ proven: aceEvidence.length > 0 && !canonicalBlocked, waiting: canonicalBlocked, partial: contracts.transport || aceEvidence.length > 0 }), [...aceEvidence, ...(contracts.transport ? [`file:${sourceFiles.transport}`] : [])], canonicalBlocked ? ['CANONICAL_LINEAGE_NOT_READY'] : (aceEvidence.length ? [] : ['ACE_PACKET_RECEIPT_MISSING'])),
  gate('CONTEXT_MANIFEST_CONTRACT_PRESENT', auditState({ proven: contracts.contextManifest }), contracts.contextManifest ? [`file:${sourceFiles.contextManifest}`] : [], contracts.contextManifest ? [] : ['CONTEXT_MANIFEST_CONTRACT_MISSING']),
  gate('PREFILL_SYNTHESIS_READY', auditState({ proven: prefillEvidence.length > 0 && !freezeBlocked && !canonicalBlocked, waiting: freezeBlocked || canonicalBlocked, partial: contracts.contextManifest || prefillEvidence.length > 0 }), [...prefillEvidence, ...(contracts.contextManifest ? [`file:${sourceFiles.contextManifest}`] : [])], [...(freezeBlocked ? ['CANDIDATE_POPULATION_FREEZE'] : []), ...(canonicalBlocked ? ['CURRENT_LINEAGE_NOT_AUTHORITATIVE'] : []), ...(prefillEvidence.length ? [] : ['PREFILL_RECEIPT_MISSING'])]),
  gate('ACP_ADAPTER_PROVEN', auditState({ proven: acpRuntimeEvidence.length > 0, partial: /['"]acp['"]/.test(agentAdapterText) || acpEvidence.length > 0 }), [...acpRuntimeEvidence, ...(acpEvidence.length ? ['advisory:acp-transport-audit-not-runtime-proof'] : []), ...(contracts.agentAdapters ? [`file:${sourceFiles.agentAdapters}`] : [])], acpRuntimeEvidence.length ? [] : ['ACP_RUNTIME_PROOF_MISSING'], { configuredInContract: /['"]acp['"]/.test(agentAdapterText), advisoryEvidence: acpEvidence }),
  gate('A2A_ADAPTER_PROVEN', auditState({ proven: a2aRuntimeEvidence.length > 0, partial: /['"]a2a['"]/.test(agentAdapterText) || a2aEvidence.length > 0 }), [...a2aRuntimeEvidence, ...(a2aEvidence.length ? ['advisory:a2a-transport-audit-not-runtime-proof'] : []), ...(contracts.agentAdapters ? [`file:${sourceFiles.agentAdapters}`] : [])], a2aRuntimeEvidence.length ? [] : ['A2A_RUNTIME_PROOF_MISSING'], { configuredInContract: /['"]a2a['"]/.test(agentAdapterText), advisoryEvidence: a2aEvidence }),
  gate('HUMAN_DECISION_RECEIPTS_PROVEN', auditState({ proven: humanEvidence.length > 0, partial: contracts.taskState }), [...humanEvidence, ...(contracts.taskState ? [`file:${sourceFiles.taskState}`] : [])], humanEvidence.length ? [] : ['HUMAN_FEEDBACK_RECEIPT_MISSING']),
  gate('PYTORCH_LEARNING_LANE_PROVEN', auditState({ proven: trainingEvidence.length > 0 }), trainingEvidence, trainingEvidence.length ? [] : ['TRAINING_AND_EVAL_RECEIPTS_MISSING'], { authority: 'SHADOW_ONLY_UNTIL_PROMOTED' }),
  gate('DIRECTORY_GRAPH_AUDIT_PRESENT', auditState({ proven: Boolean(directoryGraph) }), directoryGraph ? ['report:openspec-directory-graph-v1.json'] : [], directoryGraph ? [] : ['DIRECTORY_GRAPH_REPORT_MISSING'])
];

const counts = Object.fromEntries(['PROVEN','READY','PARTIAL','WAITING','UNPROVEN','NOT_APPLICABLE'].map((state) => [state, gates.filter((g) => g.state === state).length]));
const packetReady = ['CANONICAL_LINEAGE_READY','QDRANT_LINEAGE_TAGS_PROVEN','ACE_PACKET_READINESS_PROVEN'].every((key) => gates.find((g) => g.key === key)?.state === 'PROVEN');
const prefillReady = ['CANONICAL_LINEAGE_READY','CONTEXT_MANIFEST_CONTRACT_PRESENT','PREFILL_SYNTHESIS_READY'].every((key) => gates.find((g) => g.key === key)?.state === 'PROVEN');

const report = {
  schema: 'atlas.runtime-readiness.v1',
  generatedAt: new Date().toISOString(),
  repoRoot,
  reportsDir,
  summary: { ...counts, packetReady, prefillReady, livePromotionReady: packetReady && prefillReady && annLiveProven },
  contracts,
  gates,
  invariants: [
    'Presence of code/config is PARTIAL evidence only; live/runtime claims require receipts.',
    'ACP/A2A protocol names do not prove protocol compliance; runtime proof is separate.',
    'Human feedback is an evidence stream; PyTorch/RL outputs are shadow challengers until eval and promotion receipts exist.',
    'Cache warmth never establishes canonical identity or promotion authority.'
  ],
  writesPerformed: false
};
report.semanticChecksum = semanticChecksum(report);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, summary: report.summary, semanticChecksum: report.semanticChecksum }, null, 2));
