#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const svelteRoot = path.join(projectRoot, 'sveltekit-frontend');
const OUT_DIR = path.join(projectRoot, 'scripts/atlas/out');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      walk(filePath, results);
    } else {
      results.push(filePath);
    }
  }
  return results;
}

async function main() {
  console.log('🚀 Phase 5 Atlas: Cache Usage Extractor (USES_CACHE edges)');
  console.log();

  const edges = [];
  let edgeCount = 0;

  const srcDir = path.join(svelteRoot, 'src');
  const files = walk(srcDir).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.svelte'));

  // Regex patterns to identify cache systems
  const redisPattern = /\b(redis\.(get|set|hget|hset|del|pipeline|sadd|smembers|hscan)|getRedis\(\))\b/i;
  const semanticPattern = /\b(checkSemanticCache|saveToSemanticCache|searchSemanticCache|storeSemanticCache)\b/i;
  const acePattern = /\b(redisGetAcePacket|redisSetAcePacket|assembleACEContext|getAcePacket|setAcePacket)\b/i;

  for (const file of files) {
    const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
    if (relPath.includes('/__tests__/') || relPath.includes('.spec.ts') || relPath.includes('.test.ts')) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      let matched = false;

      if (redisPattern.test(line)) {
        edges.push({
          source_file: relPath,
          line_num: index + 1,
          cache_type: 'redis',
          operation: line.includes('set') || line.includes('hset') || line.includes('sadd') ? 'write' : 'read',
          endpoint: 'cache://redis',
        });
        edgeCount++;
        matched = true;
      }

      if (semanticPattern.test(line)) {
        edges.push({
          source_file: relPath,
          line_num: index + 1,
          cache_type: 'semantic_cache',
          operation: line.includes('save') || line.includes('store') ? 'write' : 'read',
          endpoint: 'cache://semantic',
        });
        edgeCount++;
        matched = true;
      }

      if (acePattern.test(line)) {
        edges.push({
          source_file: relPath,
          line_num: index + 1,
          cache_type: 'ace_packet_cache',
          operation: line.includes('Set') || line.includes('assemble') ? 'write' : 'read',
          endpoint: 'cache://ace_packet',
        });
        edgeCount++;
        matched = true;
      }
    });
  }

  console.log(`[OUTPUT] ${edgeCount} USES_CACHE edges found`);
  const outputFile = path.join(OUT_DIR, 'cache-usage-edges.ndjson');

  let ndjson = '';
  for (const edge of edges) {
    ndjson += JSON.stringify(edge) + '\n';
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write ${outputFile}`);
    console.log(`[SAMPLE] First 5 edges:`);
    edges.slice(0, 5).forEach(e => console.log(JSON.stringify(e)));
  } else {
    fs.writeFileSync(outputFile, ndjson);
    console.log(`[WRITE] ✓ ${outputFile}`);
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total USES_CACHE edges: ${edgeCount}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
