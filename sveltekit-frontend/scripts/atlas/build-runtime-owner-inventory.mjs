#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { alignCwdToRepoRoot, REPO_ROOT } from '../_repo-root.mjs';

const OUTPUT_DIR = path.resolve(REPO_ROOT, 'tmp', 'atlas');
const OUTPUT_FILE = path.resolve(OUTPUT_DIR, 'runtime-owner-inventory.jsonl');

function runRg(pattern, label, cwd = REPO_ROOT) {
  const args = [
    '-n',
    '--hidden',
    '--glob',
    '!node_modules/**',
    '--glob',
    '!dist/**',
    '--glob',
    '!build/**',
    '--glob',
    '!coverage/**',
    pattern,
    '.',
  ];

  const result = spawnSync('rg', args, { cwd, encoding: 'utf8', shell: false, windowsHide: true });
  const lines = (result.stdout ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const lastColon = line.lastIndexOf(':');
      const secondLastColon = line.lastIndexOf(':', lastColon - 1);
      if (secondLastColon < 0 || lastColon < 0) return null;
      const file = line.slice(0, secondLastColon);
      const rest = line.slice(secondLastColon + 1);
      return {
        evidence: rest.slice(0, 500),
        file,
        label,
        owner_state: 'CANDIDATE_NOT_PROVEN',
        readback_state: 'NOT_PROVEN',
        runtime_path_state: 'NOT_TRACED',
      };
    })
    .filter(Boolean);

  return {
    exit_code: result.status ?? 1,
    label,
    lines,
    pattern,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

async function main() {
  alignCwdToRepoRoot();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const searches = [
    runRg('embedText|embedTexts|generateEmbeddings|EmbeddingRepository|canonicalEmbed', 'embedding-entrypoints'),
    runRg('upsert\\(|upsertPoints|upsert_points|UpsertPoints|/collections/.*/points', 'qdrant-writers'),
    runRg('Pool\\(|pool\\.query|INSERT INTO|UPDATE .* SET|SELECT .* FROM', 'postgres-writers'),
    runRg('RabbitMQ|amqplib|queue|consumer|worker', 'queue-consumers'),
    runRg('graphify|Neo4j|neo4j|cypher', 'graphify-neo4j'),
    runRg('Mastra|workflow|agent|tool registration', 'mastra'),
    runRg('tRPC|trpc|procedure|router', 'trpc'),
    runRg('ACP|A2A|agent card|task envelope|message schema', 'acp-a2a'),
    runRg('MCP|mcp', 'mcp'),
    runRg('centroid:|som:|kmeans:|bifrost:|bitfrost:|ace:', 'redis-centroids'),
  ];

  const lines = [];
  for (const search of searches) {
    lines.push(JSON.stringify({
      command: `rg ${search.pattern}`,
      exit_code: search.exit_code,
      label: search.label,
      owner_state: 'CANDIDATE_NOT_PROVEN',
      readback_state: 'NOT_PROVEN',
      result_count: search.lines.length,
      runtime_path_state: 'NOT_TRACED',
      working_directory: REPO_ROOT,
    }));

    for (const line of search.lines.slice(0, 200)) {
      lines.push(JSON.stringify({
        ...line,
        command: `rg ${search.pattern}`,
        working_directory: REPO_ROOT,
      }));
    }
  }

  await writeFile(OUTPUT_FILE, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
  console.log(JSON.stringify({
    output_file: OUTPUT_FILE,
    searches: searches.length,
    total_candidates: lines.length,
    working_directory: REPO_ROOT,
  }, null, 2));
}

const cliPath = process.argv[1];

if (cliPath && import.meta.url === pathToFileURL(cliPath).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
