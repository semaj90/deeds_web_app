#!/usr/bin/env node
/**
 * domain-topology.mjs — Phase 11G
 * Builds a domain graph from feature labels:
 *   nodes: sourceRef files
 *   edges: shared feature_label relationships
 *
 * Inputs:  .tmp/feature-labels.ndjson
 * Outputs: .tmp/domain-topology.json
 *          .tmp/domain-topology-manifest.md
 */

import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';
import crypto from 'crypto';

const ROOT    = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const IN_FILE = path.join(ROOT, '.tmp', 'feature-labels.ndjson');
const OUT_JSON = path.join(ROOT, '.tmp', 'domain-topology.json');
const OUT_MD   = path.join(ROOT, '.tmp', 'domain-topology-manifest.md');

async function readNdjson(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

async function main() {
  console.log('\n── Domain Topology (Phase 11G) ───────────────────────────');

  const labels = await readNdjson(IN_FILE);
  if (!labels.length) {
    console.error('❌ feature-labels.ndjson empty — run feature-labeling.mjs first');
    process.exit(1);
  }
  console.log(`  labels: ${labels.length}`);

  // Build nodes
  const nodes = labels.map(l => ({
    id:            l.label_hash,
    sourceRef:     l.sourceRef,
    domain:        l.domain,
    feature_label: l.feature_label,
    owner_area:    l.owner_area,
  }));

  // Build edges: connect nodes that share the same feature_label
  const byLabel = new Map();
  for (const l of labels) {
    if (!byLabel.has(l.feature_label)) byLabel.set(l.feature_label, []);
    byLabel.get(l.feature_label).push(l.label_hash);
  }

  const edges = [];
  const edgeSeen = new Set();
  for (const [label, hashes] of byLabel) {
    // Connect each pair that shares a label (cap at 10 per label to avoid explosion)
    const capped = hashes.slice(0, 10);
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const key = [capped[i], capped[j]].sort().join(':');
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        edges.push({ from: capped[i], to: capped[j], label, weight: 1 });
      }
    }
  }

  // Domain cluster summary
  const domainNodes = new Map();
  for (const n of nodes) {
    if (!domainNodes.has(n.domain)) domainNodes.set(n.domain, []);
    domainNodes.get(n.domain).push(n.sourceRef);
  }

  const topology = {
    generatedAt: new Date().toISOString(),
    nodeCount:   nodes.length,
    edgeCount:   edges.length,
    domains:     Object.fromEntries(
      [...domainNodes.entries()].map(([d, srefs]) => [d, { count: srefs.length, samples: srefs.slice(0,3) }])
    ),
    nodes,
    edges,
  };

  console.log(`  nodes: ${nodes.length}  edges: ${edges.length}`);
  for (const [d, info] of Object.entries(topology.domains)) {
    console.log(`    ${d.padEnd(14)}: ${info.count} nodes`);
  }

  // Markdown manifest
  const md = [
    `# Domain Topology — ${topology.generatedAt}`,
    ``,
    `**${nodes.length} nodes** | **${edges.length} edges** | **${Object.keys(topology.domains).length} domains**`,
    ``,
    `## Domains`,
    ...Object.entries(topology.domains).map(([d, info]) =>
      `- **${d}** — ${info.count} nodes (${info.samples.map(s => `\`${s.slice(0,40)}\``).join(', ')})`
    ),
    ``,
    `## Top Feature Labels`,
    ...[...byLabel.entries()]
      .sort((a,b) => b[1].length - a[1].length)
      .slice(0, 10)
      .map(([label, hashes]) => `- \`${label}\` — ${hashes.length} nodes`),
  ].join('\n');

  if (!DRY_RUN) {
    await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify(topology, null, 2), 'utf8');
    await fs.writeFile(OUT_MD, md, 'utf8');
    console.log(`\n  ✅ wrote ${OUT_JSON}`);
    console.log(`  ✅ wrote ${OUT_MD}`);
  } else {
    console.log(`\n  dry-run: would write topology (${nodes.length} nodes, ${edges.length} edges)`);
  }

  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
