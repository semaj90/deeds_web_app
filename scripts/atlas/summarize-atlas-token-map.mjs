#!/usr/bin/env node
/**
 * scripts/atlas/summarize-atlas-token-map.mjs
 *
 * Phase 19C: Summarize Atlas NES retokenization map (dry-run).
 *
 * Inputs:
 * - .tmp/atlas-token-map.jsonl
 *
 * Outputs:
 * - .tmp/atlas-token-map.md
 */

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const INPUT_FILE = path.join(root, '.tmp/atlas-token-map.jsonl');
const OUTPUT_MD = path.join(root, '.tmp/atlas-token-map.md');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  console.log(`[SUMMARY] Reading Atlas token map from ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: ${INPUT_FILE} not found. Run scripts/atlas/build-atlas-token-map.mjs first.`);
    process.exit(1);
  }

  const lines = fs.readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const mappings = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  console.log(`[SUMMARY] Loaded ${mappings.length} mappings`);

  // Analyze metrics
  const stats = {
    total_tokens: mappings.length,
    domains: {},
    features: {},
    som_density: {},
    rewards_sum: 0,
    rewards_count: 0,
    valid_from: null,
    valid_until: null,
    graph_version: null,
  };

  mappings.forEach((m) => {
    // Domains
    stats.domains[m.domain] = (stats.domains[m.domain] || 0) + 1;
    
    // Features
    stats.features[m.feature] = (stats.features[m.feature] || 0) + 1;

    // SOM coordinate density
    const cell = `${m.som_x}_${m.som_y}`;
    stats.som_density[cell] = (stats.som_density[cell] || 0) + 1;

    // Rewards
    if (typeof m.reward_score === 'number') {
      stats.rewards_sum += m.reward_score;
      stats.rewards_count += 1;
    }

    if (!stats.graph_version) stats.graph_version = m.graphVersion;
    if (!stats.valid_from) stats.valid_from = m.validFrom;
    if (!stats.valid_until) stats.valid_until = m.validUntil;
  });

  const avgReward = stats.rewards_count > 0 ? (stats.rewards_sum / stats.rewards_count).toFixed(2) : '0.00';

  // Grouped breakdown sorting
  const sortedDomains = Object.entries(stats.domains).sort((a, b) => b[1] - a[1]);
  const sortedFeatures = Object.entries(stats.features).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sortedCells = Object.entries(stats.som_density).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Generate markdown content
  const mdContent = `# Atlas NES Retokenization Map Summary

Generated: ${new Date().toISOString()}
Graph Version: \`${stats.graph_version}\`
Validity Range: \`${stats.valid_from}\` to \`${stats.valid_until}\`

## Overall Statistics

- **Total Mapped Token Edges**: ${stats.total_tokens.toLocaleString()}
- **Average Reinforcement Reward**: ${avgReward}
- **Active Domains**: ${Object.keys(stats.domains).length}
- **Active Centroid Features**: ${Object.keys(stats.features).length}

## Domain Distribution

${sortedDomains.map(([domain, count]) => `- **${domain}**: ${count} mappings (${((count / stats.total_tokens) * 100).toFixed(1)}%)`).join('\n')}

## Top 10 Features (by mapping density)

${sortedFeatures.map(([feature, count], i) => `${i+1}. **${feature}** — ${count} references`).join('\n')}

## Top 10 SOM Coordinate Densities

${sortedCells.map(([cell, count], i) => `${i+1}. **SOM Tile (${cell.replace('_', ', ')})** — ${count} mappings`).join('\n')}

## Sample Mappings Preview

\`\`\`json
${JSON.stringify(mappings.slice(0, 5), null, 2)}
\`\`\`

---

**Status**: Dry-run validation complete. Mappings successfully serialized to \`.tmp/atlas-token-map.jsonl\` without database mutation.
`;

  ensureDir(OUTPUT_MD);
  fs.writeFileSync(OUTPUT_MD, mdContent);
  console.log(`[SUMMARY] Wrote summary markdown report to ${OUTPUT_MD}`);

  // Console output
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   ATLAS TOKEN MAP SUMMARY                      ║
╚════════════════════════════════════════════════════════════════╝

Total mappings:        ${stats.total_tokens}
Avg reward:            ${avgReward}
Graph version:         ${stats.graph_version}

Domain breakdown:
${sortedDomains.map(([d, count]) => `  - ${d}: ${count}`).join('\n')}

Top SOM cells:
${sortedCells.slice(0, 3).map(([c, count]) => `  - Coordinate (${c.replace('_', ', ')}): ${count} references`).join('\n')}
  `);
}

main().catch(console.error);
