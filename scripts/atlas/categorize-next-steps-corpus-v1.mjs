#!/usr/bin/env node
/**
 * scripts/atlas/categorize-next-steps-corpus-v1.mjs
 *
 * Keyword-based 14-domain CATEGORIZATION PROPOSAL for the tracked next_steps markdown docs.
 *
 * STATUS: proposal only. canonicalAuthority=false, reviewed=false. Domains come from regex keyword scores over the path and the first
 * 4,000 characters (score < 2 falls back to "general"); they are NOT reviewed labels (the repo's floor for trusting labels is
 * 200 reviewed rows and 30 per class, and none exist). The palette is read from the v2 CANDIDATE file (CANDIDATE_NOT_APPLIED), not from
 * the live NES registry, and is not hardcoded here.
 *
 * Implements:
 * 1. Enumeration of tracked *.md docs in next_steps/, sveltekit-frontend/next_steps/, docs/next_steps/ (generated indexes and non-markdown excluded).
 * 2. 14-domain classification using the palette read from scripts/atlas/data/nes-domain-palette-v2.candidate.json.
 * 3. A keyword TOPIC HINT (cpu/gpu/governance): documents are not jobs; this says what a doc talks about, not where anything runs.
 * 4. A heuristic community number derived from the domain (NOT graph-derived).
 * 5. Generates next_steps/CATEGORIZED_INDEX.md (complements next_steps/INDEX.md; no file is moved).
 * 6. Emits docs/reports/next-steps-14domain-categorization-v1.json (existing outputs are archived before being overwritten).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs/reports/next-steps-14domain-categorization-v1.json');
const OUT_MD = path.join(ROOT, 'next_steps/CATEGORIZED_INDEX.md');

const PALETTE_PATH = 'scripts/atlas/data/nes-domain-palette-v2.candidate.json';
const BADGES = {
  auth: '🛡️ Auth', ui: '🎨 UI', retrieval: '🔍 Retrieval', network: '🌐 Network', database: '🗄️ Database', cache: '⚡ Cache',
  agent: '🤖 Agent', graph: '🕸️ Graph', ml: '🧠 ML/GPU', general: '📄 General', compiler: '⚙️ Compiler', devops: '🚀 DevOps',
  'error-handling': '🩹 Error Handling', test: '🧪 Test',
};
const paletteBytes = fs.readFileSync(path.join(ROOT, PALETTE_PATH));
const paletteJson = JSON.parse(paletteBytes.toString('utf8'));
if (paletteJson.canonicalAuthority !== false || !paletteJson.domains || typeof paletteJson.domains !== 'object') throw new Error('PALETTE_NOT_ADMISSIBLE');
const PALETTE_INFO = {
  path: PALETTE_PATH,
  revision: paletteJson.revision,
  status: paletteJson.status,
  checksumField: paletteJson.checksum,
  fileSha256: 'sha256:' + crypto.createHash('sha256').update(paletteBytes).digest('hex'),
};
const NES_DOMAINS = Object.fromEntries(Object.entries(paletteJson.domains).map(([key, v]) => [
  key, { lutByte: v.lutByte, nesHex: v.nesHex, label: v.label, badge: BADGES[key] ?? key },
]));

const DOMAIN_KEYWORDS = {
  auth:           [/\bauth\b/i, /\bjwt\b/i, /\bpermission\b/i, /\brbac\b/i, /\blogin\b/i, /\bcredential\b/i, /\baccess_control\b/i, /\bcsp\b/i, /\bsecurity\b/i],
  ui:             [/\bsvelte\b/i, /\brunes\b/i, /\bbits-ui\b/i, /\bcomponent\b/i, /\btailwind\b/i, /\bunocss\b/i, /\bhud\b/i, /\bcourtroom\b/i, /\bcanvas\b/i, /\b\ui\b/i],
  retrieval:      [/\bretrieval\b/i, /\bqdrant\b/i, /\bann\b/i, /\bbm25\b/i, /\brrf\b/i, /\bvector\b/i, /\bsearch\b/i, /\bturbovec\b/i, /\bchunk\b/i],
  network:        [/\btrpc\b/i, /\bwebsocket\b/i, /\bhttp\b/i, /\bgrpc\b/i, /\bendpoint\b/i, /\bsocket\b/i, /\bnetwork\b/i],
  database:       [/\bdrizzle\b/i, /\bpostgres\b/i, /\bpgvector\b/i, /\bmigration\b/i, /\bschema\b/i, /\btable\b/i, /\bsql\b/i, /\bdatabase\b/i],
  cache:          [/\bvalkey\b/i, /\bredis\b/i, /\bbitfrost\b/i, /\bcache\b/i, /\blru\b/i, /\bresidency\b/i, /\bttl\b/i, /\bknapsack\b/i],
  agent:          [/\bagent\b/i, /\boak\b/i, /\brlm\b/i, /\bdspy\b/i, /\bsubagent\b/i, /\bhermes\b/i, /\blanggraph\b/i, /\bworkflow\b/i],
  graph:          [/\bcugraph\b/i, /\bpagerank\b/i, /\bneo4j\b/i, /\bhypergraph\b/i, /\bgraph\b/i, /\btopology\b/i, /\bsubgraph\b/i, /\blouvain\b/i],
  ml:             [/\bcuda\b/i, /\bgpu\b/i, /\btensor\b/i, /\btensorrt\b/i, /\baten\b/i, /\bgemm\b/i, /\bisoquant\b/i, /\bquant\b/i, /\bvlm\b/i, /\btorch\b/i, /\blibtorch\b/i, /\b3dgs\b/i],
  compiler:       [/\btree-sitter\b/i, /\bast\b/i, /\bcst\b/i, /\bparser\b/i, /\bcompiler\b/i, /\blangextract\b/i, /\bgrammar\b/i],
  devops:         [/\bdocker\b/i, /\bseaweed\b/i, /\bseaweedfs\b/i, /\bdeploy\b/i, /\binfra\b/i, /\bruntime\b/i, /\bcompose\b/i, /\bdevops\b/i],
  'error-handling':[/\brecovery\b/i, /\bdiagnose\b/i, /\bfix\b/i, /\berror\b/i, /\bresilience\b/i, /\bcircuit-breaker\b/i, /\brollback\b/i],
  test:           [/\btest\b/i, /\bsmoke\b/i, /\bplaywright\b/i, /\bspec\b/i, /\beval\b/i, /\bverification\b/i, /\bbenchmark\b/i],
};

const MISSING_KEYWORDS = Object.keys(NES_DOMAINS).filter((k) => k !== 'general' && !DOMAIN_KEYWORDS[k]);
if (MISSING_KEYWORDS.length) throw new Error('PALETTE_DOMAIN_WITHOUT_KEYWORDS: ' + MISSING_KEYWORDS.join(','));

function classifyDoc(relPath, content) {
  const text = relPath + '\n' + content.slice(0, 4000);

  // Score each domain based on keyword regex matches
  const scores = {};
  for (const [dom, patterns] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const pat of patterns) {
      const matches = text.match(new RegExp(pat.source, 'gi'));
      if (matches) score += matches.length;
    }
    // Path boost: if domain is in file path or title, boost by 5
    if (relPath.toLowerCase().includes(dom)) score += 5;
    scores[dom] = score;
  }

  // Find highest scoring domain
  let bestDomain = 'general';
  let maxScore = 0;
  for (const [dom, s] of Object.entries(scores)) {
    if (s > maxScore) {
      maxScore = s;
      bestDomain = dom;
    }
  }

  const domain = maxScore >= 2 ? bestDomain : 'general';

  // 2. Topic hint (keyword-based; documents are not worker jobs)
  let queueHint = 'CPU_TOPIC';
  if (['ml', 'graph'].includes(domain) || text.match(/\b(gpu|cuda|tensor|vlm|3dgs)\b/i)) {
    queueHint = 'GPU_TOPIC';
  } else if (['auth', 'devops'].includes(domain) || text.match(/\b(audit|gate|promotion|policy)\b/i)) {
    queueHint = 'GOVERNANCE_TOPIC';
  }

  // 3. Heuristic community number derived from the domain (NOT from the Louvain/Leiden graph assignments)
  let communityHeuristic = 10;
  if (domain === 'cache' || text.includes('bitfrost') || text.includes('prefill')) {
    communityHeuristic = 21;
  } else if (domain === 'ml' || text.includes('cuda') || text.includes('quant')) {
    communityHeuristic = 1;
  } else if (domain === 'database' || domain === 'graph') {
    communityHeuristic = 2;
  } else if (domain === 'compiler') {
    communityHeuristic = 10;
  } else if (domain === 'ui') {
    communityHeuristic = 3;
  } else if (domain === 'network') {
    communityHeuristic = 4;
  }

  // 4. Activity Status
  let activityStatus = 'ACTIVE';
  if (relPath.includes('completed/')) activityStatus = 'COMPLETED';
  else if (relPath.includes('archive/')) activityStatus = 'ARCHIVE';
  else if (relPath.includes('canonical/')) activityStatus = 'CANONICAL';
  else if (relPath.includes('plans/')) activityStatus = 'PLANNING';

  return { domain, queueHint, communityHeuristic, activityStatus };
}

function extractDocMetadata(fullPath, relPath) {
  const content = fs.readFileSync(fullPath, 'utf8');
  const sha256 = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  const lines = content.split('\n');
  const lineCount = lines.length;

  let title = path.basename(relPath);
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const m = lines[i].match(/^#+\s+(.+)$/);
    if (m) {
      title = m[1].trim();
      break;
    }
  }

  let statusLine = '';
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const m = lines[i].match(/\*\*Status\*\*:\s*([^\n|]+)/i) || lines[i].match(/Status:\s*([^\n|]+)/i);
    if (m) {
      statusLine = m[1].trim();
      break;
    }
  }

  const classification = classifyDoc(relPath, content);
  const domainInfo = NES_DOMAINS[classification.domain] || NES_DOMAINS.general;

  return {
    relPath,
    title,
    statusLine,
    lineCount,
    byteSize: Buffer.byteLength(content, 'utf8'),
    sha256,
    ...classification,
    domainLabel: domainInfo.label,
    lutByte: domainInfo.lutByte,
    nesHex: domainInfo.nesHex,
    badge: domainInfo.badge,
  };
}

async function main() {
  console.log('[Categorize Next Steps] Enumerating all tracked next_steps documents...');
  const gitOutput = execSync('git ls-files -- next_steps sveltekit-frontend/next_steps docs/next_steps', { encoding: 'utf8' });
  const trackedPaths = gitOutput.split('\n').map(p => p.trim()).filter(Boolean);
  const GENERATED_INDEXES = new Set(['next_steps/INDEX.md', 'next_steps/CATEGORIZED_INDEX.md']);
  const rawPaths = trackedPaths.filter(p => /\.md$/i.test(p) && !GENERATED_INDEXES.has(p));
  const excludedPaths = trackedPaths.filter(p => !rawPaths.includes(p));

  console.log(`✓ Discovered ${trackedPaths.length} tracked files; classifying ${rawPaths.length} markdown docs (excluded ${excludedPaths.length}: non-markdown and generated indexes)`);

  const docs = [];
  for (const relPath of rawPaths) {
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const meta = extractDocMetadata(fullPath, relPath);
      docs.push(meta);
    } catch (e) {
      console.warn(`Warning parsing ${relPath}: ${e.message}`);
    }
  }

  // Distribution stats
  const domainCounts = {};
  const queueCounts = { CPU_TOPIC: 0, GPU_TOPIC: 0, GOVERNANCE_TOPIC: 0 };
  const communityCounts = {};
  const statusCounts = {};

  for (const d of docs) {
    domainCounts[d.domain] = (domainCounts[d.domain] || 0) + 1;
    queueCounts[d.queueHint] = (queueCounts[d.queueHint] || 0) + 1;
    communityCounts[d.communityHeuristic] = (communityCounts[d.communityHeuristic] || 0) + 1;
    statusCounts[d.activityStatus] = (statusCounts[d.activityStatus] || 0) + 1;
  }

  console.log('\n--- 14-Domain Distribution ---');
  for (const [dom, count] of Object.entries(domainCounts)) {
    console.log(`  ${dom.padEnd(16, ' ')}: ${count} docs`);
  }

  console.log('\n--- Topic Hint Distribution (keyword-based) ---');
  for (const [q, count] of Object.entries(queueCounts)) {
    console.log(`  ${q.padEnd(16, ' ')}: ${count} docs`);
  }

  // 1. Emit JSON Catalog
  const jsonReport = {
    schema: 'atlas.next-steps-categorized-corpus.v1',
    generatedAt: new Date().toISOString(),
    canonicalAuthority: false,
    reviewed: false,
    status: 'PROPOSAL_KEYWORD_HEURISTIC',
    writesPerformed: false,
    method: 'regex keyword score over path + first 4000 chars; score < 2 -> general; topic hint and community are heuristics, not graph or execution data',
    palette: PALETTE_INFO,
    excluded: { count: excludedPaths.length, paths: excludedPaths },
    totalDocuments: docs.length,
    distributions: {
      domains: domainCounts,
      topicHints: queueCounts,
      communitiesHeuristic: communityCounts,
      statuses: statusCounts,
    },
    documents: docs,
  };

  const archiveIfExists = (p) => {
    if (!fs.existsSync(p)) return;
    const dir = path.join(ROOT, 'docs/reports/archive', new Date().toISOString().slice(0, 10) + '-next-steps-categorization');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    fs.copyFileSync(p, path.join(dir, path.basename(p).replace(/(\.[a-z]+)$/i, '.' + stamp + '$1')));
  };
  archiveIfExists(OUT_JSON);
  archiveIfExists(OUT_MD);
  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonReport, null, 2));
  console.log(`\n✓ JSON report written to ${OUT_JSON}`);

  // 2. Generate Categorized Markdown Index
  console.log(`[Categorize Next Steps] Generating ${OUT_MD}...`);
  const mdLines = [];
  mdLines.push('# Next Steps — Categorized 14-Domain Index');
  mdLines.push('');
  mdLines.push(`**Generated**: ${new Date().toISOString()} | **Docs classified**: ${docs.length} markdown (generated indexes and non-markdown excluded: ${excludedPaths.length}) | **Status**: PROPOSAL, unreviewed, \`canonicalAuthority:false\` | **Palette**: ${PALETTE_INFO.revision} (${PALETTE_INFO.status}, checksum \`${String(PALETTE_INFO.checksumField).slice(0, 15)}...\`)`);
mdLines.push('');
mdLines.push('Complements [INDEX.md](./INDEX.md) (every tracked doc with date and Status line). Domains are keyword scores, not reviewed labels. "Topic hint" says what a doc talks about, not where anything runs; documents are not worker jobs. "Comm*" is a heuristic number derived from the domain, not a graph community. No file was moved.');
  mdLines.push('');
  mdLines.push('## Topic Hint Summary (keyword-based)');
  mdLines.push('');
  mdLines.push(`- **cpu topics** (\`CPU_TOPIC\`): ${queueCounts.CPU_TOPIC} docs (default; no gpu/audit keywords)`);
  mdLines.push(`- **gpu topics** (\`GPU_TOPIC\`): ${queueCounts.GPU_TOPIC} docs (ml/graph domain, or the words gpu, cuda, tensor, vlm, 3dgs appear)`);
  mdLines.push(`- **governance topics** (\`GOVERNANCE_TOPIC\`): ${queueCounts.GOVERNANCE_TOPIC} docs (auth/devops domain, or the words audit, gate, promotion, policy appear)`);
  mdLines.push('');
  mdLines.push('## Domain Table of Contents');
  mdLines.push('');

  for (const [domKey, domInfo] of Object.entries(NES_DOMAINS)) {
    const count = domainCounts[domKey] || 0;
    mdLines.push(`- [${domInfo.badge} (${count})](#${domKey.replace(/[^a-z0-9]+/g, '-')})`);
  }
  mdLines.push('');

  // Group docs by domain
  for (const [domKey, domInfo] of Object.entries(NES_DOMAINS)) {
    const domDocs = docs.filter(d => d.domain === domKey);
    mdLines.push(`### <a id="${domKey.replace(/[^a-z0-9]+/g, '-')}"></a>${domInfo.badge} (\`${domInfo.label}\` | Byte: ${domInfo.lutByte} | Hex: \`${domInfo.nesHex}\`) — ${domDocs.length} Docs`);
    mdLines.push('');
    mdLines.push('| Document | Status | Topic hint | Comm* | Title |');
    mdLines.push('|---|---|---|:---:|---|');

    for (const d of domDocs) {
      const encodedPath = d.relPath.split('/').map((seg) => encodeURIComponent(seg).replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/');
      const docLink = `[${path.basename(d.relPath)}](../${encodedPath})`;
      const cleanTitle = d.title.replace(/\|/g, '\\|');
      const cleanStatus = d.statusLine ? `\`${d.statusLine.slice(0, 24)}\`` : `\`${d.activityStatus}\``;
      mdLines.push(`| ${docLink} | ${cleanStatus} | \`${d.queueHint}\` | ${d.communityHeuristic} | ${cleanTitle} |`);
    }
    mdLines.push('');
  }

  fs.writeFileSync(OUT_MD, mdLines.join('\n'));
  console.log(`✓ Categorized index written to ${OUT_MD}`);
}

main().catch(err => {
  console.error('[Error in Categorize Next Steps]:', err);
  process.exit(1);
});
