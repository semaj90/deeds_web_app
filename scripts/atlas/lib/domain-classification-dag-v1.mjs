/**
 * Bounded classification DAG (pure; lanes are injected). DeterministicRouter -> HierarchicalClassifier -> ConfidenceGate,
 * then at most MAX_LANES advisory lanes for uncertain items. Output is ALWAYS a proposal:
 *   canonicalIdentity:false, canonicalAuthority:false, status PROPOSAL_ONLY. No lane may supply packet/repository/relation/revision identity.
 */
export const MAX_LANES = 3;
export const LANE_NAMES = Object.freeze(['EMBEDDING_SIMILARITY', 'GRAPH_NEIGHBOR', 'LOCAL_NLP']);
const FORBIDDEN_LANE_KEYS = ['packetKey', 'packet_key', 'repositoryId', 'relationId', 'sourceRevision', 'source_revision', 'workspaceRevision'];

/** Fields that identify or prove provenance and must never reach a predictive model (leakage). */
export const LEAKAGE_FIELDS = Object.freeze(['packetKey', 'packet_key', 'sourceRef', 'source_ref', 'sourceRevision', 'workspaceRevision', 'contentHash', 'repositoryId', 'domainClass', 'domain_class', 'label', 'goldLabel']);

export function stripLeakage(features) {
  const kept = {}; const removed = [];
  for (const [k, v] of Object.entries(features)) (LEAKAGE_FIELDS.includes(k) ? removed.push(k) : (kept[k] = v));
  return { features: kept, removedLeakageFields: removed.sort() };
}

const isDigest = (v) => /^sha256:[0-9a-f]{64}$/.test(v ?? '');

/**
 * @param {{item:{id:string, sourceDigest:string, features:object}, router:(item)=>{domainId:string,rule:string}|null,
 *   classifier:(features)=>{domainId:string,confidence:number}|null, lanes?:Record<string,(item,{signal:AbortSignal})=>Promise<{domainId:string,confidence:number,evidenceRefs:string[]}>>,
 *   resolver:{byId:Map}, thresholds?:{accept:number,reject:number}, laneBudget?:{maxLanes:number,timeoutMs:number}}} input
 */
export async function classifyWithFanout({ item, router, classifier, lanes = {}, resolver, thresholds = { accept: 0.85, reject: 0.4 }, laneBudget = { maxLanes: MAX_LANES, timeoutMs: 2000 } }) {
  const receipt = { itemId: item.id, sourceDigest: item.sourceDigest, stages: [], laneReceipts: [], errors: [] };
  const base = { itemId: item.id, canonicalIdentity: false, canonicalAuthority: false, relationPersisted: false };
  if (!isDigest(item.sourceDigest)) return { ...base, status: 'ABSTAIN', reason: 'SOURCE_DIGEST_MISSING', receipt };
  if (!(thresholds.reject >= 0 && thresholds.accept <= 1 && thresholds.reject < thresholds.accept)) return { ...base, status: 'ABSTAIN', reason: 'THRESHOLDS_INVALID', receipt };

  const known = (id) => resolver.byId.has(id);
  const routed = router(item);
  if (routed && known(routed.domainId)) {
    receipt.stages.push({ stage: 'DeterministicRouter', domainId: routed.domainId, rule: routed.rule });
    return { ...base, status: 'PROPOSAL_ONLY', domainId: routed.domainId, confidence: 1, basis: 'DETERMINISTIC_RULE', receipt };
  }
  receipt.stages.push({ stage: 'DeterministicRouter', domainId: null });

  const { features, removedLeakageFields } = stripLeakage(item.features ?? {});
  receipt.stages.push({ stage: 'HierarchicalClassifier', removedLeakageFields });
  const predicted = classifier(features);
  if (predicted && !known(predicted.domainId)) { receipt.errors.push(`CLASSIFIER_UNKNOWN_DOMAIN:${predicted.domainId}`); }
  const valid = predicted && known(predicted.domainId) && Number.isFinite(predicted.confidence) ? predicted : null;
  if (valid) receipt.stages.push({ stage: 'HierarchicalClassifier', domainId: valid.domainId, confidence: valid.confidence });

  if (valid && valid.confidence >= thresholds.accept) {
    receipt.stages.push({ stage: 'ConfidenceGate', decision: 'ACCEPT_AS_PROPOSAL' });
    return { ...base, status: 'PROPOSAL_ONLY', domainId: valid.domainId, confidence: valid.confidence, basis: 'CLASSIFIER', receipt };
  }
  if (valid && valid.confidence < thresholds.reject) {
    receipt.stages.push({ stage: 'ConfidenceGate', decision: 'REJECT_LOW_CONFIDENCE' });
    return { ...base, status: 'ABSTAIN', reason: 'CONFIDENCE_BELOW_REJECT', confidence: valid.confidence, receipt };
  }
  receipt.stages.push({ stage: 'ConfidenceGate', decision: 'UNCERTAIN_FANOUT' });

  const names = Object.keys(lanes).filter((n) => LANE_NAMES.includes(n));
  for (const n of Object.keys(lanes)) if (!LANE_NAMES.includes(n)) receipt.errors.push(`LANE_NOT_ALLOWED:${n}`);
  const budget = Math.min(laneBudget.maxLanes, MAX_LANES);
  const chosen = names.slice(0, budget);
  if (names.length > budget) receipt.errors.push(`LANE_BUDGET_EXCEEDED:${names.length}>${budget}`);

  const votes = [];
  for (const name of chosen) {
    const controller = new AbortController();
    let timer;
    const started = Date.now();
    try {
      const result = await Promise.race([
        lanes[name](item, { signal: controller.signal }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('LANE_TIMEOUT')); }, laneBudget.timeoutMs); }),
      ]);
      const leaked = FORBIDDEN_LANE_KEYS.filter((k) => result && k in result);
      if (leaked.length) throw new Error(`LANE_RETURNED_IDENTITY_FIELDS:${leaked.join(',')}`);
      if (!result || !known(result.domainId) || !Number.isFinite(result.confidence) || !Array.isArray(result.evidenceRefs) || result.evidenceRefs.length === 0) throw new Error('LANE_RESULT_INVALID');
      votes.push({ lane: name, ...result });
      receipt.laneReceipts.push({ lane: name, ok: true, ms: Date.now() - started, domainId: result.domainId, confidence: result.confidence });
    } catch (error) {
      receipt.laneReceipts.push({ lane: name, ok: false, ms: Date.now() - started, error: String(error.message) });
      receipt.errors.push(`${name}:${error.message}`);
    } finally { clearTimeout(timer); }
  }

  // Agreement rule: advisory lanes can only confirm the classifier's candidate or agree with each other; they never override alone.
  const tally = new Map();
  if (valid) tally.set(valid.domainId, { weight: valid.confidence, lanes: ['CLASSIFIER'] });
  for (const v of votes) { const t = tally.get(v.domainId) ?? { weight: 0, lanes: [] }; t.weight += v.confidence; t.lanes.push(v.lane); tally.set(v.domainId, t); }
  const ranked = [...tally.entries()].filter(([, t]) => t.lanes.length >= 2).sort((a, b) => b[1].weight - a[1].weight || (a[0] < b[0] ? -1 : 1));
  if (ranked.length === 0) return { ...base, status: 'ABSTAIN', reason: 'NO_LANE_AGREEMENT', receipt };
  if (ranked.length > 1 && Math.abs(ranked[0][1].weight - ranked[1][1].weight) < 1e-9) return { ...base, status: 'ABSTAIN', reason: 'TIED_AGREEMENT', receipt };
  const [domainId, t] = ranked[0];
  return { ...base, status: 'PROPOSAL_ONLY', domainId, confidence: Math.min(1, t.weight / t.lanes.length), basis: `AGREEMENT:${t.lanes.join('+')}`, receipt };
}

/** Group-aware split: every item of a group (file family / lineage) lands in exactly one partition. Deterministic by group key. */
export function groupSplit(items, groupOf, { train = 0.7, validation = 0.15 } = {}) {
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const out = { train: [], validation: [], test: [] };
  for (const item of items) {
    const u = hash(String(groupOf(item)));
    out[u < train ? 'train' : u < train + validation ? 'validation' : 'test'].push(item);
  }
  return out;
}

export function assertNoGroupLeakage(split, groupOf) {
  const owner = new Map(); const leaks = [];
  for (const part of ['train', 'validation', 'test']) for (const item of split[part]) {
    const g = String(groupOf(item));
    if (owner.has(g) && owner.get(g) !== part) leaks.push(g); else owner.set(g, part);
  }
  return { leaked: leaks.length > 0, groups: [...new Set(leaks)].sort() };
}
