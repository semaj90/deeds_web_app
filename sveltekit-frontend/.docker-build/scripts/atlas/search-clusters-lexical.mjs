#!/usr/bin/env node
/**
 * scripts/atlas/search-clusters-lexical.mjs
 * 
 * "Lane 0" search optimized for cluster discovery using ripgrep.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const DIGEST_PATH = resolve(process.cwd(), 'docs/graph/hypergraph-clusters.md');

function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: node search-clusters-lexical.mjs <query>');
    process.exit(1);
  }

  if (!existsSync(DIGEST_PATH)) {
    console.error(`❌ Digest missing: ${DIGEST_PATH}`);
    process.exit(1);
  }

  console.log(`🔍 Lane 0 Lexical Search for: "${query}"`);

  try {
    // 1. Search for headers
    const headerCmd = `rg -i "^### Cluster [0-9]+ — .*${query}" "${DIGEST_PATH}"`;
    const headers = execSync(headerCmd, { encoding: 'utf8' }).split('\n').filter(Boolean);
    
    // 2. Search for top symbols/dirs
    const symbolCmd = `rg -i "Top symbols:.*${query}" "${DIGEST_PATH}" --context 2`;
    const symbols = execSync(symbolCmd, { encoding: 'utf8' }).split('\n').filter(Boolean);

    const clusterIds = new Set();
    const allMatches = [...headers, ...symbols];

    for (const match of allMatches) {
      const idMatch = match.match(/### Cluster (\d+)/);
      if (idMatch) clusterIds.add(parseInt(idMatch[1], 10));
    }

    // If no direct matches, scan the whole file for the keyword and find nearest header
    if (clusterIds.size === 0) {
      const deepCmd = `rg -i "${query}" "${DIGEST_PATH}" --line-number`;
      const deepHits = execSync(deepCmd, { encoding: 'utf8' }).split('\n').filter(Boolean);
      
      const fileContent = readFileSync(DIGEST_PATH, 'utf8').split('\n');
      for (const hit of deepHits) {
        const lineNum = parseInt(hit.split(':')[0], 10);
        for (let i = lineNum - 1; i >= 0; i--) {
          const m = fileContent[i].match(/^### Cluster (\d+)/);
          if (m) {
            clusterIds.add(parseInt(m[1], 10));
            break;
          }
        }
      }
    }

    const ids = Array.from(clusterIds).sort((a, b) => a - b);
    console.log(`✅ Found ${ids.length} candidate clusters: ${ids.join(', ')}`);
    console.log(JSON.stringify(ids)); // Output for shell integration
  } catch (err) {
    console.log('[] '); // No clusters found
  }
}

main();
