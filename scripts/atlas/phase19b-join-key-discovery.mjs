#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const opencodeDir = path.join(repoRoot, '.opencode');
const cardsDir = path.join(opencodeDir, 'cards');
const outcomeFile = path.join(opencodeDir, 'outcome-ledger.ndjson');

function safeReadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ return null; }
}

function ensureTmp(){ try{ fs.mkdirSync('.tmp', { recursive: true }); } catch(e){} }

function normalizeRef(ref){
  if(!ref || typeof ref !== 'string') return '';
  let r = ref;
  // strip schemes
  r = r.replace(/^file:\/\//i,'').replace(/^file:/i,'');
  // backslashes -> slash
  r = r.replace(/\\/g, '/');
  // normalize repo roots
  r = r.replace(/^sveltekit-frontend\//i, '');
  r = r.replace(/^src\//i, 'src/');
  // collapse multiple slashes
  r = r.replace(/\/+/g, '/');
  // remove anchor and line suffixes
  r = r.replace(/#L\d+(?:-L\d+)?$/,'');
  r = r.replace(/:\d+(?::\d+)?$/,'');
  // trim
  r = r.replace(/^\/+|\/+$/g, '');
  return r.toLowerCase();
}

function sha256hex(s){
  return require('crypto').createHash('sha256').update(String(s)).digest('hex');
}

ensureTmp();

// CLI flags
const argv = process.argv.slice(2);
const useManualOverrides = argv.includes('--manual-overrides');

// load cards
const cardFiles = fs.existsSync(cardsDir) ? fs.readdirSync(cardsDir).filter(f=>f.endsWith('.json')) : [];
const cards = {};
for(const f of cardFiles){
  const p = path.join(cardsDir, f);
  const j = safeReadJSON(p);
  if(!j) continue;
  const id = path.basename(f, '.json');
  cards[id] = j;
}

// build indexes with richer suffix keys
const normIndex = {}; // normalized path -> [cardId]
const twoSegIndex = {}; // last two segments -> [cardId]
const oneSegIndex = {}; // last segment -> [cardId]
const parentFileIndex = {}; // parentDir/filename -> [cardId]
for(const [id,j] of Object.entries(cards)){
  const candidates = [];
  if(j.sourceRef) candidates.push(j.sourceRef);
  if(j.source) candidates.push(j.source);
  if(j.source_ref) candidates.push(j.source_ref);
  if(j.filePath) candidates.push(j.filePath);
  if(j.stableKey) candidates.push(j.stableKey);
  // also consider id-like entries
  candidates.push(id);
  for(const c of candidates){ if(!c) continue; const n = normalizeRef(String(c)); if(!n) continue;
    if(!normIndex[n]) normIndex[n]=[]; if(!normIndex[n].includes(id)) normIndex[n].push(id);
    const parts = n.split('/').filter(Boolean);
    if(parts.length>=1){ const last = parts.slice(-1)[0]; if(!oneSegIndex[last]) oneSegIndex[last]=[]; if(!oneSegIndex[last].includes(id)) oneSegIndex[last].push(id); }
    if(parts.length>=2){ const two = parts.slice(-2).join('/'); if(!twoSegIndex[two]) twoSegIndex[two]=[]; if(!twoSegIndex[two].includes(id)) twoSegIndex[two].push(id); }
    if(parts.length>=2){ const parentFile = parts.slice(-2).join('/'); if(!parentFileIndex[parentFile]) parentFileIndex[parentFile]=[]; if(!parentFileIndex[parentFile].includes(id)) parentFileIndex[parentFile].push(id); }
  }
}

// read previous discovery if exists
let prev = null;
const prevPath = '.tmp/phase19b-join-key-discovery.json';
if(fs.existsSync(prevPath)){
  try{ prev = JSON.parse(fs.readFileSync(prevPath,'utf8')); }catch(e){ prev = null; }
}

// process ledger rows
const lines = fs.existsSync(outcomeFile) ? fs.readFileSync(outcomeFile,'utf8').split(/\r?\n/).filter(Boolean) : [];
const ledger = [];
const proposed = []; // {index, ledgerObj, candidateId, reason, confidence}
const ambiguous = [];
const unmatched = [];

for(let i=0;i<lines.length;i++){
  const line = lines[i];
  let obj=null; try{ obj=JSON.parse(line);}catch(e){ obj={_raw:line}; }
  ledger.push(obj);
  // extract sourceRefs array or string
  const sourceRefs = obj.sourceRefs || obj.sourceRef || obj.source || obj.source_ref || null;
  let matched = null; let matchReason=null; let confidence=0;
  // helper to attempt and return candidate array
  function getCandidatesForNormalized(s){ const a = normIndex[s] || []; return a.slice(); }

  // 1) exact normalized sourceRef
  let svals = Array.isArray(sourceRefs)? sourceRefs:[sourceRefs];
  for(const sv of svals){ if(!sv) continue; const n = normalizeRef(String(sv)); if(!n) continue; const cands = getCandidatesForNormalized(n); if(cands.length===1){ matched=cands[0]; matchReason='exact_normalized_sourceRef'; confidence=0.99; break; } }

  // 2) exact normalized stableKey/filePath
  if(!matched){ const sk = obj.stableKey || obj.filePath || null; if(sk){ const nsk = normalizeRef(String(sk)); const cands = getCandidatesForNormalized(nsk); if(cands.length===1){ matched=cands[0]; matchReason='exact_normalized_stableKey'; confidence=0.9; } else if(cands.length>1){ ambiguous.push({ledgerIndex:i, reason:'stableKey_multiple', stableKey:nsk, matches:cands.slice(0,10)}); } } }

  // 3) suffix path match (two-segment then one-segment), prefer unambiguous
  if(!matched && svals.length>0){
    for(const sv of svals){ if(!sv) continue; const n = normalizeRef(String(sv)); const parts = n.split('/').filter(Boolean); if(parts.length>=2){ const two = parts.slice(-2).join('/'); const c2 = twoSegIndex[two]||[]; if(c2.length===1){ matched=c2[0]; matchReason='suffix_two_seg'; confidence=0.85; break; } if(c2.length>1){ ambiguous.push({ledgerIndex:i, reason:'two_seg_multiple', suffix:two, matches:c2.slice(0,10)}); }
      }
      // one-segment token
      const one = n.split('/').pop(); const c1 = oneSegIndex[one]||[]; if(c1.length===1){ matched=c1[0]; matchReason='suffix_one_seg'; confidence=0.6; break; } if(c1.length>1){ ambiguous.push({ledgerIndex:i, reason:'one_seg_multiple', suffix:one, matches:c1.slice(0,10)}); }
    }
  }

  // 4) filename + parent-dir match (e.g., server/cache-config.ts) exact
  if(!matched && svals.length>0){
    for(const sv of svals){ if(!sv) continue; const n = normalizeRef(String(sv)); const parts = n.split('/').filter(Boolean); if(parts.length>=2){ const parentFile = parts.slice(-2).join('/'); const c = parentFileIndex[parentFile]||[]; if(c.length===1){ matched=c[0]; matchReason='parentFile_match'; confidence=0.92; break; } if(c.length>1){ ambiguous.push({ledgerIndex:i, reason:'parentfile_multiple', parentFile, matches:c.slice(0,10)}); }
      }
    }
  }

  if(matched){ proposed.push({ ledgerIndex: i, ledger: obj, candidate: matched, reason: matchReason, confidence }); }
  else {
    if(ambiguous.some(a=>a.ledgerIndex===i)){
      // leave ambiguous (do not join)
    } else {
      unmatched.push({ ledgerIndex: i, ledger: obj });
    }
  }
}

// specifically inspect cache-config.ts rows
const cacheRows = [];
for(const p of proposed) {
  const s = p.ledger && (p.ledger.sourceRef || p.ledger.sourceRefs || p.ledger.source);
  const norm = Array.isArray(s) ? normalizeRef(s[0]) : normalizeRef(s);
  if(norm && norm.includes('cache-config.ts')) cacheRows.push(p);
}

// build report
const prevMatched = prev ? (prev.matchedByNormalizedSourceRef || 0) + (prev.matchedBySuffixSourceRef || 0) + (prev.matchedByNormalizedStableKey||0) + (prev.matchedBySuffixStableKey||0) + (prev.matchedByClusterKey||0) : 0;
const newMatched = proposed.length;
const ambiguousCount = ambiguous.length;
const unmatchedCount = unmatched.length;

const outJson = {
  runAt: new Date().toISOString(),
  previousMatchedCount: prevMatched,
  newMatchedCount: newMatched,
  cacheConfigMatchedRows: cacheRows.map(r=>({ ledgerIndex: r.ledgerIndex, candidate: r.candidate, reason: r.reason, confidence: r.confidence })),
  ambiguousMatches: ambiguous.slice(0,200),
  unmatchedRows: unmatched.slice(0,200),
  topRemainingUnmatched: (()=>{
    const counts = {};
    for(const u of unmatched){ const s = u.ledger && (u.ledger.sourceRef || u.ledger.sourceRefs || u.ledger.source) || ''; const n = normalizeRef(Array.isArray(s)?s[0]:s); counts[n] = (counts[n]||0)+1; }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({ref:k,count:v}));
  })(),
  recommendedNormalization: [
    "strip file: and file://",
    "normalize separators to / and lower-case",
    "remove repo-root prefix like sveltekit-frontend/ or leading src/",
    "prefer two-segment suffix match then parentDir+filename then single filename",
    "do not auto-join ambiguous results; surface for manual review"
  ],
  proposedMatches: proposed.slice(0,500).map(p=>({ ledgerIndex: p.ledgerIndex, candidate: p.candidate, reason: p.reason, confidence: p.confidence }))
};

fs.writeFileSync('.tmp/phase19b-join-key-discovery-rerun.json', JSON.stringify(outJson, null, 2));

let md = '# Phase19B join-key discovery RERUN (suffix heuristic)\n\n';
md += `Run at: ${outJson.runAt}\n\n`;
md += `Previous matched count: ${outJson.previousMatchedCount}\n`;
md += `New matched count: ${outJson.newMatchedCount}\n`;
md += `Cache-config.ts matched rows: ${outJson.cacheConfigMatchedRows.length}\n`;
md += `Ambiguous matches: ${outJson.ambiguousMatches.length}\n`;
md += `Unmatched rows: ${outJson.unmatchedRows.length}\n\n`;
md += 'Top remaining unmatched normalized refs:\n\n';
for(const t of outJson.topRemainingUnmatched) md += `- ${t.ref} : ${t.count}\n`;
md += '\nRecommended permanent normalization rule:\n\n';
for(const r of outJson.recommendedNormalization) md += `- ${r}\n`;

fs.writeFileSync('.tmp/phase19b-join-key-discovery-rerun.md', md);

console.log('Rerun completed. Outputs: .tmp/phase19b-join-key-discovery-rerun.json/.md');

// If manual overrides requested, load overrides and attempt manual matches for unmatched rows
if(useManualOverrides){
  const overridesPath = '.tmp/phase19b-manual-join-overrides.json';
  const manualOutJsonPath = '.tmp/phase19b-join-key-discovery-manual-rerun.json';
  const manualOutMdPath = '.tmp/phase19b-join-key-discovery-manual-rerun.md';
  let overrides = null;
  if(fs.existsSync(overridesPath)){
    try{ overrides = JSON.parse(fs.readFileSync(overridesPath,'utf8')); }catch(e){ overrides = null; }
  }

  const manualMatches = [];
  const invalidOverrides = [];
  const ambiguousOverrides = [];

  if(overrides && Array.isArray(overrides.overrides)){
    // For each override, validate cardId existence and exact ledgerNormalizedSourceRef
    for(const ov of overrides.overrides){
      const requiredRef = String(ov.ledgerNormalizedSourceRef||'').trim();
      const requiredCardId = String(ov.cardId||'').trim();
      if(!requiredRef || !requiredCardId){ invalidOverrides.push({override:ov, reason:'missing_fields'}); continue; }

      // find ledger rows with normalized ref equal
      const matchingUnmatched = unmatched.filter(u=>{
        const s = u.ledger && (u.ledger.sourceRef || u.ledger.sourceRefs || u.ledger.source || u.ledger.source_ref) || '';
        const n = normalizeRef(Array.isArray(s)? s[0] : s);
        return n === requiredRef;
      });

      if(matchingUnmatched.length===0){ invalidOverrides.push({override:ov, reason:'no_matching_ledger_row'}); continue; }

      // validate cardId exists uniquely in cards map (keys)
      const matchingCards = Object.keys(cards).filter(k=>k === requiredCardId);
      if(matchingCards.length===0){ invalidOverrides.push({override:ov, reason:'cardId_not_found'}); continue; }
      if(matchingCards.length>1){ ambiguousOverrides.push({override:ov, reason:'cardId_multiple_matches', matches: matchingCards}); continue; }

      // apply override to all matching unmatched ledger rows (but do not remove from cards or mutate cards)
      for(const u of matchingUnmatched){
        manualMatches.push({ ledgerIndex: u.ledgerIndex, ledger: u.ledger, candidate: requiredCardId, reason: 'manual_override', confidence: Number(ov.confidence||1.0), matchSource: 'manualOverride', acceptedBy: ov.acceptedBy||'manual-review', note: ov.reason||'' });
      }
    }
  }

  // Merge manualMatches into proposed (but ensure they replace unmatched entries)
  for(const m of manualMatches){
    proposed.push({ ledgerIndex: m.ledgerIndex, ledger: m.ledger, candidate: m.candidate, reason: m.reason, confidence: m.confidence, matchSource: m.matchSource, acceptedBy: m.acceptedBy });
    // remove from unmatched list
    const idx = unmatched.findIndex(u=>u.ledgerIndex===m.ledgerIndex);
    if(idx>=0) unmatched.splice(idx,1);
  }

  // build manual out json
  const manualOut = {
    runAt: new Date().toISOString(),
    previousMatchedCount: outJson.previousMatchedCount,
    beforeManualMatchedCount: outJson.newMatchedCount,
    afterManualMatchedCount: proposed.length,
    manualOverrideMatches: manualMatches.map(m=>({ ledgerIndex: m.ledgerIndex, candidate: m.candidate, reason: m.reason, confidence: m.confidence })),
    invalidOverrides,
    ambiguousOverrides,
    remainingUnmatched: unmatched.slice(0,200),
    topRemainingUnmatched: (()=>{
      const counts = {};
      for(const u of unmatched){ const s = u.ledger && (u.ledger.sourceRef || u.ledger.sourceRefs || u.ledger.source) || ''; const n = normalizeRef(Array.isArray(s)?s[0]:s); counts[n] = (counts[n]||0)+1; }
      return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({ref:k,count:v}));
    })(),
  };

  fs.writeFileSync(manualOutJsonPath, JSON.stringify(manualOut, null, 2));

  let md2 = '# Phase19B join-key discovery MANUAL RERUN (manual overrides applied)\n\n';
  md2 += `Run at: ${manualOut.runAt}\n\n`;
  md2 += `Previous matched count: ${manualOut.previousMatchedCount}\n`;
  md2 += `Before manual matched count: ${manualOut.beforeManualMatchedCount}\n`;
  md2 += `After manual matched count: ${manualOut.afterManualMatchedCount}\n\n`;
  md2 += 'Manual override matches:\n\n';
  for(const m of manualOut.manualOverrideMatches) md2 += `- ledgerIndex: ${m.ledgerIndex} -> ${m.candidate} (${m.reason}, conf=${m.confidence})\n`;
  md2 += '\nInvalid overrides:\n\n';
  for(const iv of manualOut.invalidOverrides) md2 += `- ${JSON.stringify(iv)}\n`;
  md2 += '\nAmbiguous overrides:\n\n';
  for(const av of manualOut.ambiguousOverrides) md2 += `- ${JSON.stringify(av)}\n`;
  md2 += '\nTop remaining unmatched normalized refs:\n\n';
  for(const t of manualOut.topRemainingUnmatched) md2 += `- ${t.ref} : ${t.count}\n`;

  fs.writeFileSync(manualOutMdPath, md2);
  console.log('Manual rerun completed. Outputs:', manualOutJsonPath, manualOutMdPath);
}
