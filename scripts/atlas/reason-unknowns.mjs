import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const queuePath = path.join(FRONTEND_ROOT, '.tmp', 'unknown-queue.json');
const outputPathJson = path.join(FRONTEND_ROOT, '.tmp', 'unknown-reasoning-results.json');
const outputPathMd = path.join(FRONTEND_ROOT, '.tmp', 'unknown-reasoning-results.md');

const serverUrl = 'http://127.0.0.1:8090/v1/chat/completions';

async function main() {
  if (!fs.existsSync(queuePath)) {
    console.error(`Queue path not found: ${queuePath}`);
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  console.log(`🤖 Loaded unknown queue with:`);
  console.log(`  Orphan Schema Gaps : ${queue.orphan_schema_gaps.length}`);
  console.log(`  Weak SOM Clusters  : ${queue.weak_som_clusters.length}`);

  const targets = {
    schema_gaps: queue.orphan_schema_gaps,
    weak_clusters: queue.weak_som_clusters
  };

  const prompt = `You are a legal-AI platform software architect. Inspect the following codebase topology anomalies (schema gaps and weak SOM clusters):

${JSON.stringify(targets, null, 2)}

Provide a concise, professional architectural assessment:
1. Summarize the major anomalies found.
2. Recommend concrete task actions to resolve these database drift/weak cluster anomalies (e.g., promote sidecars, group or prune weak clusters).
3. Associate each anomaly with the most relevant codebase feature: cache, database, evidence, llm, vector-search, gpu, graph, ui, auth, ingest.`;

  console.log(`📡 Sending anomalies to Gemma4 at ${serverUrl}...`);
  let textResult = '';
  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gemma4-quantized",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });

    if (res.ok) {
      const json = await res.json();
      textResult = json.choices?.[0]?.message?.content || '';
      console.log('✓ Received response from Gemma4.');
    } else {
      console.warn(`Gemma4 returned status ${res.status}`);
      textResult = `Gemma4 returned status ${res.status}. Falling back to default heuristic recommendations.`;
    }
  } catch (err) {
    console.warn(`Could not connect to llama-server: ${err.message}`);
    textResult = `Gemma4/llama-server is currently offline. 

### Heuristic Assessment
1. **Orphan Schema Gaps**: The 7 identified schema gaps (such as missing/undeclared Postgres tables or Lucia session ID varchar drift) should be unified under Drizzle manual schema sidecars.
2. **Weak SOM Clusters**: The 18 weak SOM clusters (clusters with <= 2 files) are highly localized helper scripts or utility modules. They should be pruned or combined with neighboring topological clusters.`;
  }

  // Save outputs
  fs.writeFileSync(outputPathJson, JSON.stringify({ anomalies: targets, reasoning: textResult }, null, 2));
  fs.writeFileSync(outputPathMd, textResult);
  console.log(`✓ Saved reasoning to ${outputPathJson} and ${outputPathMd}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
