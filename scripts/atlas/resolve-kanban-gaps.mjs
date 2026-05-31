import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const kanbanTasksPath = path.join(FRONTEND_ROOT, '.tmp', 'kanban_tasks.jsonl');

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const rules = [
  { re: /\bcache\b|\/cache\//i, feature: 'cache' },
  { re: /\bdb\b|drizzle|pg\b|postgres|sql|query/ig, feature: 'database' },
  { re: /evidence|courtroom|timeline|document|legal|statute/ig, feature: 'evidence' },
  { re: /ollama|gemma|llm|llama|model|embed|embedding/ig, feature: 'llm' },
  { re: /qdrant|vector|pgvector|hnsw/ig, feature: 'vector-search' },
  { re: /gpu|libtorch|tensorrt|cuda|webgpu/ig, feature: 'gpu' },
  { re: /neo4j|graph|pagerank|topology/ig, feature: 'graph' },
  { re: /ui|svelte|component|button|dialog|bits-ui/ig, feature: 'ui' },
  { re: /auth|session|lucia|login|logout|csrf/ig, feature: 'auth' },
  { re: /ingest|upload|minio|seaweed|s3|object storage/ig, feature: 'ingest' },
];

function main() {
  console.log('🩹 Repairing Kanban tasks to resolve missing feature_id gaps...');

  if (!fs.existsSync(kanbanTasksPath)) {
    console.error(`Kanban tasks not found at ${kanbanTasksPath}`);
    process.exit(1);
  }

  const tasks = readJsonl(kanbanTasksPath);
  console.log(`Loaded ${tasks.length} total Kanban tasks.`);

  let repairedCount = 0;

  const repairedTasks = tasks.map(task => {
    const updated = { ...task };
    
    // Ensure source_ref is explicitly set
    if (!updated.source_ref) {
      updated.source_ref = task.file || task.sourceRef || task.source || '';
    }

    if (task.feature) {
      return updated; // already has a feature classification
    }

    // Attempt to match feature using heuristics on title, file, or notes
    let matchedFeature = 'other';
    const textToMatch = `${task.title || ''} ${task.file || ''} ${task.notes || ''}`;

    for (const rule of rules) {
      if (rule.re.test(textToMatch)) {
        matchedFeature = rule.feature;
        break;
      }
    }

    repairedCount++;
    updated.feature = matchedFeature;
    return updated;
  });

  const outputLines = repairedTasks.map(t => JSON.stringify(t)).join('\n') + '\n';
  fs.writeFileSync(kanbanTasksPath, outputLines);

  console.log(`\n==================================================`);
  console.log(`✓ Kanban Tasks Repaired: ${repairedCount}`);
  console.log(`  Fully Classified Tasks written back: ${repairedTasks.length}`);
  console.log(`==================================================`);
}

main();
