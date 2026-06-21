#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');

if (!existsSync(workflowPath)) {
  console.error(`❌ Recommendation workflow index not found at ${workflowPath}`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(workflowPath, 'utf8'));

console.log(`Calculating recommendation ranking scores...`);

for (const card of cards) {
  // 1. Error similarity (based on confidence or query length heuristic)
  const error_similarity = card.confidence ?? 0.8;

  // 2. Packet relevance (based on files count, max 1.0)
  const packet_relevance = Math.min((card.top_files?.length ?? 0) * 0.5, 1.0);

  // 3. Graph proximity (based on neighborhood count, max 1.0)
  const graph_proximity = Math.min((card.graph_neighbors?.length ?? 0) * 0.3, 1.0);

  // 4. Prior successful fix (1.0 if has success prior fix, 0 otherwise)
  const hasSuccessfulFix = card.prior_fixes?.some(f => f.result === 'success') ?? false;
  const prior_successful_fix = hasSuccessfulFix ? 1.0 : 0.0;

  // 5. Recency (1.0 if recent/ready, lower if status is verified or blocked)
  let recency = 1.0;
  if (card.status === 'verified') recency = 0.5;
  if (card.status === 'blocked')  recency = 0.2;

  // Compute final score using formula
  const score = (
    0.30 * error_similarity +
    0.25 * packet_relevance +
    0.20 * graph_proximity +
    0.15 * prior_successful_fix +
    0.10 * recency
  );

  card.recommendation_score = Number(score.toFixed(4));
}

// Sort cards by recommendation_score descending
cards.sort((a, b) => (b.recommendation_score ?? 0) - (a.recommendation_score ?? 0));

writeFileSync(workflowPath, JSON.stringify(cards, null, 2));

console.log(`✓ Recommendation summaries and scores updated.`);
for (let i = 0; i < Math.min(5, cards.length); i++) {
  const c = cards[i];
  console.log(`  [Rank ${i+1}] Score: ${c.recommendation_score} | ID: ${c.task_id} | Query: "${c.query}"`);
}
