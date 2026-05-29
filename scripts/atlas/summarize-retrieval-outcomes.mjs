#!/usr/bin/env node
/**
 * scripts/atlas/summarize-retrieval-outcomes.mjs
 *
 * Phase 7: Summarize outcomes.jsonl and output reports to .tmp/ directory.
 */

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const ledgerPath = path.join(root, 'memory/retrieval/outcomes.jsonl');
const tmpDir = path.join(root, '.tmp');
const jsonOut = path.join(tmpDir, 'retrieval-outcome-summary.json');
const mdOut = path.join(tmpDir, 'retrieval-outcome-summary.md');

function main() {
  console.log('📊 Summarizing Retrieval Outcomes Ledger...');

  if (!fs.existsSync(ledgerPath)) {
    console.error(`Ledger file not found: ${ledgerPath}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
  const total = lines.length;

  let success = 0;
  let failure = 0;
  let partial = 0;
  let pending = 0;

  let cacheHits = 0;
  let recsAccepted = 0;
  let recsRated = 0;
  let totalReward = 0;
  let rewardCount = 0;

  const intents = {};
  const domains = {};
  const subdomains = {};
  const tools = {};

  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (e) {
      continue;
    }

    // Outcome counts
    if (row.outcome === 'success') success++;
    else if (row.outcome === 'failure') failure++;
    else if (row.outcome === 'partial') partial++;
    else pending++;

    // Cache hits
    if (row.cacheHit) cacheHits++;

    // Recommendations accepted
    if (row.recommendationAccepted !== null && row.recommendationAccepted !== undefined) {
      recsRated++;
      if (row.recommendationAccepted) recsAccepted++;
    }

    // Rewards
    if (row.reward !== null && row.reward !== undefined) {
      totalReward += row.reward;
      rewardCount++;
    }

    // Breakdown aggregations
    if (row.intent) intents[row.intent] = (intents[row.intent] || 0) + 1;
    if (row.domain) domains[row.domain] = (domains[row.domain] || 0) + 1;
    if (row.subdomain) subdomains[row.subdomain] = (subdomains[row.subdomain] || 0) + 1;

    if (Array.isArray(row.toolsUsed)) {
      for (const t of row.toolsUsed) {
        tools[t] = (tools[t] || 0) + 1;
      }
    }
  }

  const avgReward = rewardCount > 0 ? Number((totalReward / rewardCount).toFixed(3)) : null;
  const cacheHitRate = total > 0 ? Number((cacheHits / total).toFixed(3)) : 0;
  const recAcceptanceRate = recsRated > 0 ? Number((recsAccepted / recsRated).toFixed(3)) : null;

  const summary = {
    generatedAt: new Date().toISOString(),
    totalQueries: total,
    outcomes: {
      success,
      failure,
      partial,
      pending,
      successRate: total > 0 ? Number((success / total).toFixed(3)) : 0
    },
    cacheHitRate,
    recAcceptanceRate,
    avgReward,
    breakdown: {
      intents,
      domains,
      subdomains,
      tools
    }
  };

  // Ensure output dir exists
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Write JSON report
  fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
  console.log(`✓ Wrote JSON summary to ${jsonOut}`);

  // Generate Markdown report
  const mdReport = `# Retrieval Outcome Ledger Summary

Generated: ${summary.generatedAt}

## Key Metrics

| Metric | Value |
|--------|-------|
| **Total Queries Mapped** | ${summary.totalQueries} |
| **Overall Success Rate** | ${(summary.outcomes.successRate * 100).toFixed(1)}% |
| **Cache Hit Rate** | ${(summary.cacheHitRate * 100).toFixed(1)}% |
| **Avg Reward Score** | ${summary.avgReward !== null ? summary.avgReward.toFixed(3) : 'N/A'} |
| **Recommendation Acceptance Rate** | ${summary.recAcceptanceRate !== null ? (summary.recAcceptanceRate * 100).toFixed(1) + '%' : 'N/A'} |

## Outcome Distributions

- **Success**: ${success} (${(total > 0 ? (success / total * 100) : 0).toFixed(1)}%)
- **Failure**: ${failure} (${(total > 0 ? (failure / total * 100) : 0).toFixed(1)}%)
- **Partial**: ${partial} (${(total > 0 ? (partial / total * 100) : 0).toFixed(1)}%)
- **Pending**: ${pending} (${(total > 0 ? (pending / total * 100) : 0).toFixed(1)}%)

## Breakdown by Intent & Domain

### Intents
${Object.entries(intents).map(([name, count]) => `- **${name}**: ${count} (${(count / total * 100).toFixed(1)}%)`).join('\n')}

### Domains
${Object.entries(domains).map(([name, count]) => `- **${name}**: ${count} (${(count / total * 100).toFixed(1)}%)`).join('\n')}

### Tools Used
${Object.entries(tools).map(([name, count]) => `- **${name}**: ${count}`).join('\n')}
`;

  fs.writeFileSync(mdOut, mdReport);
  console.log(`✓ Wrote Markdown summary to ${mdOut}`);
}

main();
