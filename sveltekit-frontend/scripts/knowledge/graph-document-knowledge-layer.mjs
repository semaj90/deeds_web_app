#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const langextPath = path.join(knowledgeDir, 'document-knowledge-cards.langext.jsonl');
const cardsPath = path.join(knowledgeDir, 'document-knowledge-cards.jsonl');
const edgesPath = path.join(knowledgeDir, 'document-knowledge-edges.jsonl');
const manifestPath = path.join(knowledgeDir, 'document-knowledge-manifest.json');

async function readJsonl(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter((v) => typeof v === 'string' && v.trim().length > 0))];
}

function normalizeCard(card) {
  return {
    ...card,
    sourceRefs: uniq(card.sourceRefs ?? []),
    chunkIds: uniq(card.chunkIds ?? []),
    summaryIds: uniq(card.summaryIds ?? []),
    featureLabels: uniq(card.featureLabels ?? []),
    clusterTags: uniq(card.clusterTags ?? []),
    entities: {
      files: uniq(card.entities?.files ?? []),
      routes: uniq(card.entities?.routes ?? []),
      tables: uniq(card.entities?.tables ?? []),
      envVars: uniq(card.entities?.envVars ?? []),
      services: uniq(card.entities?.services ?? []),
      commands: uniq(card.entities?.commands ?? []),
      models: uniq(card.entities?.models ?? []),
    },
  };
}

function scoreOverlap(a, b, key) {
  const left = new Set(a.entities?.[key] ?? []);
  const right = b.entities?.[key] ?? [];
  let overlap = 0;
  const shared = [];
  for (const item of right) {
    if (left.has(item)) {
      overlap += 1;
      shared.push(item);
    }
  }
  return { overlap, shared };
}

function bestRelation(a, b) {
  const sharedFeatureLabels = a.featureLabels.filter((x) => b.featureLabels.includes(x));
  if (sharedFeatureLabels.length > 0) {
    return {
      relation: 'uses',
      reason: `shared_feature_labels:${sharedFeatureLabels.slice(0, 4).join(',')}`,
    };
  }

  const sharedFiles = scoreOverlap(a, b, 'files');
  if (sharedFiles.overlap > 0) {
    return {
      relation: a.kind === b.kind ? 'implements' : 'depends_on',
      reason: `shared_files:${sharedFiles.shared.slice(0, 4).join(',')}`,
    };
  }

  const sharedRoutes = scoreOverlap(a, b, 'routes');
  if (sharedRoutes.overlap > 0) {
    return {
      relation: 'depends_on',
      reason: `shared_routes:${sharedRoutes.shared.slice(0, 4).join(',')}`,
    };
  }

  const sharedTables = scoreOverlap(a, b, 'tables');
  if (sharedTables.overlap > 0) {
    return {
      relation: 'uses',
      reason: `shared_tables:${sharedTables.shared.slice(0, 4).join(',')}`,
    };
  }

  const sharedServices = scoreOverlap(a, b, 'services');
  if (sharedServices.overlap > 0) {
    return {
      relation: 'depends_on',
      reason: `shared_services:${sharedServices.shared.slice(0, 4).join(',')}`,
    };
  }

  const sharedCommands = scoreOverlap(a, b, 'commands');
  if (sharedCommands.overlap > 0) {
    return {
      relation: 'implements',
      reason: `shared_commands:${sharedCommands.shared.slice(0, 4).join(',')}`,
    };
  }

  const sharedModels = scoreOverlap(a, b, 'models');
  if (sharedModels.overlap > 0) {
    return {
      relation: 'uses_model',
      reason: `shared_models:${sharedModels.shared.slice(0, 4).join(',')}`,
    };
  }

  const sharedSourceRefs = a.sourceRefs.filter((x) => b.sourceRefs.includes(x));
  if (sharedSourceRefs.length > 0) {
    return {
      relation: 'replaces',
      reason: `shared_sourceRefs:${sharedSourceRefs.slice(0, 4).join(',')}`,
    };
  }

  return null;
}

async function main() {
  const enrichedExists = existsSync(langextPath);
  const inputPath = enrichedExists ? langextPath : cardsPath;
  if (!existsSync(inputPath)) {
    console.error(`Missing cards file: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const cards = (await readJsonl(inputPath)).map(normalizeCard);
  const edges = [];
  const seen = new Set();

  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const left = cards[i];
      const right = cards[j];
      const relation = bestRelation(left, right);
      if (!relation) continue;
      const edgeKey = `${left.cardId}:${relation.relation}:${right.cardId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      edges.push({
        sourceId: left.cardId,
        targetId: right.cardId,
        relation: relation.relation,
        reason: relation.reason,
      });
    }
  }

  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.writeFile(edgesPath, edges.map((edge) => JSON.stringify(edge)).join('\n') + '\n', 'utf8');

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.generatedAt = new Date().toISOString();
    manifest.counts = manifest.counts || {};
    manifest.counts.edges = edges.length;
    manifest.graph = {
      enriched: enrichedExists,
      input: inputPath,
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch {
    // ignore
  }

  console.log(JSON.stringify({
    edges_built: edges.length,
    input: inputPath,
    output: edgesPath,
    enriched: enrichedExists,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
