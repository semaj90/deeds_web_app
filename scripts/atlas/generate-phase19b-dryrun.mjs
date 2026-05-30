#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Use current working directory as repo root (works reliably on Windows)
const repoRoot = process.cwd();
const opencodeDir = path.join(repoRoot, '.opencode');
const cardsDir = path.join(opencodeDir, 'cards');
const outcomeFile = path.join(opencodeDir, 'outcome-ledger.ndjson');
const outDir = path.join(repoRoot, 'memory', 'rewards');

function safeReadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(outDir);

// load cards metadata and build lookup indexes
const cardFiles = fs.existsSync(cardsDir) ? fs.readdirSync(cardsDir).filter(f => f.endsWith('.json')) : [];
const cards = {};
const sourceIndex = {}; // sourceRef -> cardId
const clusterIndex = {}; // cardId -> cluster
const cardIdIndex = {}; // possible card id fields -> cardId
const stableKeyIndex = {}; // stableKey -> cardId
const filePathIndex = {}; // filePath -> cardId
const domainIndex = {}; // domain token -> cardId
const clusterToCards = {}; // cluster -> [cardId]
const normalizedSourceIndex = {}; // normalized sourceRef -> cardId
const suffixIndex = {}; // suffix token -> [cardId]
const normalizedStableIndex = {}; // normalized stableKey -> cardId
for (const f of cardFiles) {
  const p = path.join(cardsDir, f);
  const j = safeReadJSON(p);
  if (!j) continue;
  const id = path.basename(f, '.json');
  cards[id] = j;
  // possible fields that indicate sourceRef
  const candidates = [j.sourceRef, j.source_ref, j.source, j.metadata && j.metadata.sourceRef, j.meta && j.meta.sourceRef, j.id, j.cardId, j.sourceRefPath];
  for (const c of candidates) {
    if (!c) continue;
    const key = String(c);
    if (!sourceIndex[key]) sourceIndex[key] = id;
    // normalized index
    try {
      const nk = String(key);
      const nn = nk.replaceAll('\\','/');
      const low = nn.toLowerCase();
      if (!normalizedSourceIndex[low]) normalizedSourceIndex[low] = id;
      const tok = low.split('/').pop();
      if (tok) { if (!suffixIndex[tok]) suffixIndex[tok] = []; suffixIndex[tok].push(id); }
    } catch(e){}
  }
  // also index by filename-like last path token
  if (j.sourceRef && typeof j.sourceRef === 'string') {
    const tok = j.sourceRef.split('/').pop();
    if (tok) sourceIndex[tok] = id;
  }
  // additional reverse indexes for join-key discovery
  const possibleCardIds = [j.cardId, j.card_id, j.id, j.id_str, j._id].filter(Boolean);
  for (const v of possibleCardIds) {
    try { cardIdIndex[String(v)] = id; } catch(e){}
  }
  if (j.stableKey) stableKeyIndex[String(j.stableKey)] = id;
  if (j.stableKey) {
    try { normalizedStableIndex[String(j.stableKey).replaceAll('\\','/').toLowerCase()] = id; } catch(e){}
  }
  if (j.filePath) filePathIndex[String(j.filePath).replaceAll('\\','/')] = id;
  // domain token
  const src = j.sourceRef || j.source || (j.metadata && j.metadata.source) || null;
  if (src && typeof src === 'string') {
    const dom = src.split('/')[0];
    if (dom) {
      if (!domainIndex[dom]) domainIndex[dom] = [];
      domainIndex[dom].push(id);
    }
  }
  // cluster tag
  const cluster = j.cluster || (j.meta && j.meta.cluster) || (j.metadata && j.metadata.cluster) || (j.tags && j.tags[0]) || 'unknown';
  clusterIndex[id] = cluster;
  if (!clusterToCards[cluster]) clusterToCards[cluster] = [];
  clusterToCards[cluster].push(id);
}

// Normalization helper for refs
function normalizeRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  let r = String(ref);
  // backslash -> slash
  r = r.replaceAll('\\','/');
  // remove repo absolute prefix
  const repoPrefix = repoRoot.replaceAll('\\','/');
  if (r.startsWith(repoPrefix)) r = r.slice(repoPrefix.length);
  // remove leading ./ or /
  r = r.replace(/^\.\//, '').replace(/^\//, '');
  // remove line suffix patterns like #L10 or #L10-L20
  r = r.replace(/#L\d+(?:-L\d+)?$/,'');
  // remove trailing :line or :line:col (e.g. file:123 or file:123:45)
  r = r.replace(/:\d+(?::\d+)?$/,'');
  // collapse duplicate slashes
    // collapse duplicate forward slashes and trim
    r = r.replace(/\/+/g, '/'); // collapse multiple forward slashes
    r = r.replace(/^\/+|\/+$/g, ''); // ensure no leading/trailing slashes
  return r.toLowerCase();
}

// --- Sample first 20 ledger rows and 20 card files for join-key discovery ---
const sampleLedger = [];
const sampleCards = [];
if (fs.existsSync(outcomeFile)) {
  const lines = fs.readFileSync(outcomeFile, 'utf8').split(/\r?\n/).filter(Boolean);
  for (let i=0;i<Math.min(20, lines.length); i++) {
    try { sampleLedger.push(JSON.parse(lines[i])); } catch(e) { sampleLedger.push({raw: lines[i]}); }
  }
}
for (let i=0;i<Math.min(20, cardFiles.length); i++) {
  const p = path.join(cardsDir, cardFiles[i]);
  const j = safeReadJSON(p);
  sampleCards.push({ file: cardFiles[i], body: j });
}

// Candidate join fields to report
const candidateFields = [
  'cardId', 'card_id', 'id', 'sourceRef', 'sourceRefs', 'source_ref', 'filePath', 'stableKey', 'clusterKey', 'glyphId'
];

// write discovery outputs to .tmp
try { fs.mkdirSync('.tmp', { recursive: true }); } catch (e) {}
fs.writeFileSync('.tmp/phase19b-join-key-discovery.json', JSON.stringify({ sampleLedger, sampleCards, candidateFields }, null, 2));
let md = '# Phase19B join-key discovery\n\n';
md += 'Sampled first 20 ledger rows and first 20 card files. Candidate fields:\n\n';
for (const f of candidateFields) md += `- ${f}\n`;
fs.writeFileSync('.tmp/phase19b-join-key-discovery.md', md);

// Stats containers & match counters
const statsByTool = {}; // toolName -> { count, sum, latest }
const statsBySource = {}; // sourceRef -> { count, sum, latest, graphVersions: Set, cardId }
const clusterStats = {}; // cluster -> { cards, rewardSum, rewardCount }
let ledgerRows = 0;
let cardsLoaded = Object.keys(cards).length;
let matchedByCardId = 0;
let matchedBySourceRef = 0;
let matchedByStableKey = 0;
let matchedByClusterKey = 0;
let matchedByFallback = 0;
let unmatchedLedgerRows = 0;
let unmatchedCards = 0;
const ledgerMatches = {}; // ledger index -> matched cardId

// helper for promotion state
function promotionState(avg, count) {
  if (avg === null) return 'cold';
  if (avg >= 0.85 && count >= 5) return 'promoted';
  if (avg >= 0.6 && count >= 2) return 'warm';
  return 'cold';
}

  if (fs.existsSync(outcomeFile)) {
  const rl = fs.readFileSync(outcomeFile, 'utf8').split(/\r?\n/);
  for (let li=0; li<rl.length; li++) {
    const line = rl[li];
    if (!line || !line.trim()) continue;
    ledgerRows += 1;
    let obj;
    try { obj = JSON.parse(line); } catch(e) { obj = { _raw: line }; }
    const gv = obj.graphVersion || obj.graph_version || null;
    const sourceRef = obj.sourceRef || obj.source || obj.source_ref || obj.sourceRefs || null;
    // discover join: attempt in order
        let matchedCard = null;
        // counters for normalized matching
        if (typeof globalThis.matchedByNormalizedSourceRef === 'undefined') {
          globalThis.matchedByNormalizedSourceRef = 0;
          globalThis.matchedBySuffixSourceRef = 0;
          globalThis.matchedByNormalizedStableKey = 0;
          globalThis.matchedBySuffixStableKey = 0;
          globalThis.matchedByClusterKey = 0;
          globalThis.ambiguousSuffixMatches = 0;
          globalThis.ambiguousExamples = [];
        }
        // 1) exact cardId/id match
        const possibleId = obj.cardId || obj.id || obj.card_id || null;
        if (possibleId) {
          const mid = cardIdIndex[String(possibleId)];
          if (mid) { matchedCard = mid; matchedByCardId += 1; }
        }
        // 2) normalized sourceRef exact
        if (!matchedCard && sourceRef) {
          const svals = Array.isArray(sourceRef) ? sourceRef : [sourceRef];
          for (const sv of svals) {
            const n = normalizeRef(String(sv));
            if (!n) continue;
            const mapped = normalizedSourceIndex[n];
            if (mapped) { matchedCard = mapped; globalThis.matchedByNormalizedSourceRef += 1; break; }
          }
        }
        // 3) normalized sourceRef suffix (last token) — only join if single match
        if (!matchedCard && sourceRef) {
          const svals = Array.isArray(sourceRef) ? sourceRef : [sourceRef];
          for (const sv of svals) {
            const n = normalizeRef(String(sv));
            if (!n) continue;
            const tok = n.split('/').pop();
            if (!tok) continue;
            const hits = suffixIndex[tok] || [];
            if (hits.length === 1) { matchedCard = hits[0]; globalThis.matchedBySuffixSourceRef += 1; break; }
            if (hits.length > 1) {
              globalThis.ambiguousSuffixMatches += 1;
              globalThis.ambiguousExamples.push({ ledgerIndex: li, sourceRef: n, suffix: tok, matches: hits.slice(0,10) });
              // do not join on ambiguous suffix
            }
          }
        }
        // 4) normalized stableKey exact
        if (!matchedCard) {
          const sk = obj.stableKey || obj.filePath || null;
          if (sk) {
            const nk = normalizeRef(String(sk));
            if (nk && normalizedStableIndex[nk]) { matchedCard = normalizedStableIndex[nk]; globalThis.matchedByNormalizedStableKey += 1; }
          }
        }
        // 5) normalized stableKey suffix
        if (!matchedCard) {
          const sk = obj.stableKey || obj.filePath || null;
          if (sk) {
            const nk = normalizeRef(String(sk));
            if (nk) {
              const tok = nk.split('/').pop();
              const hits = suffixIndex[tok] || [];
              if (hits.length === 1) { matchedCard = hits[0]; globalThis.matchedBySuffixStableKey += 1; }
              else if (hits.length > 1) {
                globalThis.ambiguousSuffixMatches += 1;
                globalThis.ambiguousExamples.push({ ledgerIndex: li, stableKey: nk, suffix: tok, matches: hits.slice(0,10) });
              }
            }
          }
        }
        // 6) clusterKey exact
        if (!matchedCard && obj.clusterKey) {
          const c = String(obj.clusterKey);
          const arr = clusterToCards[c];
          if (arr && arr.length>0) { matchedCard = arr[0]; globalThis.matchedByClusterKey += 1; }
        }
        // 7) fallback: cluster/domain grouping
        if (!matchedCard && sourceRef && typeof sourceRef === 'string') {
          const dom = String(sourceRef).split('/')[0];
          const hits = domainIndex[dom];
          if (hits && hits.length>0) { matchedCard = hits[0]; matchedByFallback += 1; }
        }
    const reward = typeof obj.reward === 'number' ? obj.reward : (typeof obj.reward_score === 'number' ? obj.reward_score : (typeof obj.score === 'number' ? obj.score : null));
    const tool = obj.tool || obj.toolName || obj.action || 'unknown';
    const ts = obj.ts || obj.timestamp || obj.time || null;

    // tool-level aggregation
    const t = String(tool);
    if (!statsByTool[t]) statsByTool[t] = { count: 0, sum: 0, latest: null };
    if (typeof reward === 'number') { statsByTool[t].count += 1; statsByTool[t].sum += reward; }
    if (ts || reward !== null) statsByTool[t].latest = { ts, reward, sourceRef, graphVersion: gv };

    // source-level aggregation
    const sKey = String(sourceRef);
    if (!statsBySource[sKey]) statsBySource[sKey] = { count: 0, sum: 0, latest: null, graphVersions: new Set(), cardId: null };
    if (typeof reward === 'number') { statsBySource[sKey].count += 1; statsBySource[sKey].sum += reward; }
    statsBySource[sKey].graphVersions.add(gv);
    statsBySource[sKey].latest = { ts, reward, graphVersion: gv };
    // map sourceRef -> card if possible (update from matchedCard too)
    if (!statsBySource[sKey].cardId) {
      const mapped = matchedCard || sourceIndex[sKey] || sourceIndex[sKey.split('/').pop() || ''] || null;
      if (mapped) statsBySource[sKey].cardId = mapped;
    }
    if (matchedCard) ledgerMatches[li] = matchedCard;
  }
}

// build cluster stats from card list and mapped rewards
for (const [cardId, card] of Object.entries(cards)) {
  const cluster = clusterIndex[cardId] || 'unknown';
  if (!clusterStats[cluster]) clusterStats[cluster] = { cards: 0, rewardSum: 0, rewardCount: 0 };
  clusterStats[cluster].cards += 1;
}
for (const [src, s] of Object.entries(statsBySource)) {
  const cid = s.cardId;
  const cluster = cid ? (clusterIndex[cid] || 'unknown') : 'unknown';
  if (!clusterStats[cluster]) clusterStats[cluster] = { cards: 0, rewardSum: 0, rewardCount: 0 };
  if (s.count > 0) { clusterStats[cluster].rewardSum += s.sum; clusterStats[cluster].rewardCount += s.count; }
}

// compute unmatched cards
const matchedCardSet = new Set(Object.values(ledgerMatches));
unmatchedCards = Math.max(0, Object.keys(cards).length - matchedCardSet.size);

// compute final normalized-match counters from globals (if set)
const matchedByNormalizedSourceRef = globalThis.matchedByNormalizedSourceRef || 0;
const matchedBySuffixSourceRef = globalThis.matchedBySuffixSourceRef || 0;
const matchedByNormalizedStableKey = globalThis.matchedByNormalizedStableKey || 0;
const matchedBySuffixStableKey = globalThis.matchedBySuffixStableKey || 0;
const finalMatchedByClusterKey = globalThis.matchedByClusterKey || matchedByClusterKey || 0;
const ambiguousSuffixMatches = globalThis.ambiguousSuffixMatches || 0;
const ambiguousExamples = globalThis.ambiguousExamples || [];

// top unmatched normalized sourceRefs (from statsBySource entries without cardId)
const unmatchedNormCounts = {};
for (const [src, s] of Object.entries(statsBySource)) {
  if (s.cardId) continue;
  const n = normalizeRef(src || '') || src;
  unmatchedNormCounts[n] = (unmatchedNormCounts[n] || 0) + (s.count || 1);
}
const topUnmatched = Object.entries(unmatchedNormCounts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({ref:k,count:v}));

// write join-key discovery summary
const discovery = {
  ledgerRows,
  cardsLoaded: Object.keys(cards).length,
  matchedByCardId,
  matchedByNormalizedSourceRef,
  matchedBySuffixSourceRef,
  matchedByNormalizedStableKey,
  matchedBySuffixStableKey,
  matchedByClusterKey: finalMatchedByClusterKey,
  matchedByFallback,
  ambiguousSuffixMatches,
  unmatchedLedgerRows: ledgerRows - Object.keys(ledgerMatches).length,
  unmatchedCards,
  sampleLedger, sampleCards, candidateFields,
  ambiguousExamples,
  topUnmatched
};
fs.writeFileSync('.tmp/phase19b-join-key-discovery.json', JSON.stringify(discovery, null, 2));
let md2 = '# Phase19B join-key discovery results\n\n';
md2 += `ledgerRows: ${ledgerRows}\n`;
md2 += `cardsLoaded: ${Object.keys(cards).length}\n`;
md2 += `matchedByCardId: ${matchedByCardId}\n`;
md2 += `matchedByNormalizedSourceRef: ${matchedByNormalizedSourceRef}\n`;
md2 += `matchedBySuffixSourceRef: ${matchedBySuffixSourceRef}\n`;
md2 += `matchedByNormalizedStableKey: ${matchedByNormalizedStableKey}\n`;
md2 += `matchedBySuffixStableKey: ${matchedBySuffixStableKey}\n`;
md2 += `matchedByClusterKey: ${finalMatchedByClusterKey}\n`;
md2 += `matchedByFallback: ${matchedByFallback}\n`;
md2 += `ambiguousSuffixMatches: ${ambiguousSuffixMatches}\n`;
md2 += `unmatchedLedgerRows: ${ledgerRows - Object.keys(ledgerMatches).length}\n`;
md2 += `unmatchedCards: ${unmatchedCards}\n\n`;
md2 += 'Top unmatched normalized sourceRefs:\n\n';
for (const t of topUnmatched) md2 += `- ${t.ref} : ${t.count}\n`;
md2 += '\nAmbiguous suffix examples (first 10):\n\n';
for (const ex of ambiguousExamples.slice(0,10)) md2 += `- ledgerIndex=${ex.ledgerIndex} suffix=${ex.suffix} matches=${ex.matches.join(', ')} sourceRef=${ex.sourceRef}\n`;
fs.writeFileSync('.tmp/phase19b-join-key-discovery.md', md2);

// finalize outputs
const toolPerformance = Object.fromEntries(Object.entries(statsByTool).map(([k,v])=>[
  k, { count: v.count, average: v.count>0 ? v.sum/v.count : null, latest: v.latest }
]));

const sourcePerformance = Object.fromEntries(Object.entries(statsBySource).map(([k,v])=>{
  const avg = v.count>0 ? v.sum/v.count : null;
  const card = v.cardId ? cards[v.cardId] : null;
  const authority = card && (card.authority || (card.meta && card.meta.authority)) ? (card.authority || card.meta.authority) : null;
  const som = card && (card.som || (card.meta && card.meta.som)) ? (card.som || card.meta.som) : null;
  const cluster = v.cardId ? (clusterIndex[v.cardId] || 'unknown') : 'unknown';
  const promo = promotionState(avg, v.count);
  const retention = promo === 'promoted' ? 'hot' : (promo === 'warm' ? 'warm' : 'cold');
  return [k, {
    count: v.count,
    average: avg,
    latest: v.latest,
    graphVersions: Array.from(v.graphVersions).slice(0,5),
    cardId: v.cardId || null,
    authority: authority,
    som: som,
    cluster: cluster,
    promotionState: promo,
    retentionClass: retention
  }];
}));

const clusterPerformance = Object.fromEntries(Object.entries(clusterStats).map(([k,v])=>[
  k, { cards: v.cards, rewardCount: v.rewardCount, averageReward: v.rewardCount>0 ? v.rewardSum / v.rewardCount : null }
]));

// write outputs
fs.writeFileSync(path.join(outDir, 'tool-performance.json'), JSON.stringify(toolPerformance, null, 2));
fs.writeFileSync(path.join(outDir, 'sourceRef-performance.json'), JSON.stringify(sourcePerformance, null, 2));
fs.writeFileSync(path.join(outDir, 'cluster-performance.json'), JSON.stringify(clusterPerformance, null, 2));

console.log('Phase19B dry-run artifacts written to', outDir);
console.log('cards loaded:', Object.keys(cards).length);
console.log('tool entries:', Object.keys(toolPerformance).length);
console.log('source entries:', Object.keys(sourcePerformance).length);
console.log('clusters:', Object.keys(clusterPerformance).length);
