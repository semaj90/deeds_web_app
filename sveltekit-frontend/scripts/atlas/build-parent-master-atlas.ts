#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from '../../src/lib/server/db/client.js';
import { engramCards } from '../../src/lib/server/db/schema.js';
import { searchNotecards } from '../../src/lib/server/kb/search-logic.js';
import { generateText } from 'ai';
// Assuming we have access to the local Ollama/TurboQuant models
import { createOpenAI } from '@ai-sdk/openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

// Uses the 8090 turboquant instance as configured in opencode.json
const localAi = createOpenAI({
  baseURL: 'http://127.0.0.1:8090/v1',
  apiKey: 'local',
});
const model = localAi('gemma4-tq');

function walk(dir: string, out: string[] = []): string[] {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (rel.startsWith('node_modules/') || rel.startsWith('.git/') || rel.startsWith('build/') || rel.startsWith('dist/') || rel.startsWith('.svelte-kit/')) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /(?:\.md|\.txt)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function synthesizeFile(filePath: string, text: string, hash: string) {
  // Token efficient check
  const content = text.slice(0, 4000);
  const sourceRef = `local:${filePath}#sha256:${hash}`;

  const prompt = `Synthesize a brief technical index summary for the following file content.
You MUST only reference the provided sourceRef. If you cannot, return: { "needsResearch": true }

SourceRef: ${sourceRef}
Content:
${content}

Return ONLY a valid JSON object matching this schema:
{
  "summary": "Brief summary including the sourceRef text verbatim",
  "tags": ["tag1", "tag2"],
  "sourceRefs": ["${sourceRef}"]
}`;

  try {
    const { text: resultJson } = await generateText({
      model,
      prompt,
    });
    
    // Attempt to parse the JSON
    let parsed: any;
    try {
      parsed = JSON.parse(resultJson.replace(/```json|```/g, '').trim());
    } catch {
      // Fallback manual parse if the LLM output is malformed
      parsed = { summary: resultJson.slice(0, 200), tags: [], sourceRefs: [] };
    }

    return parsed;

  } catch (error) {
    console.warn(`Failed to synthesize ${filePath}:`, error);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`Building Parent Master Atlas Index... (Dry Run: ${dryRun})`);
  const files = walk(root);
  console.log(`Found ${files.length} .md and .txt files to index.`);

  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (text.trim().length < 50) {
      skipped++;
      continue;
    }

    const hash = crypto.createHash('sha256').update(text).digest('hex');
    
    const relPath = path.relative(root, file).replace(/\\/g, '/');
    const expectedRef = `local:${relPath}#sha256:${hash}`;
    console.log(`[${processed + skipped + 1}/${files.length}] Synthesizing ${relPath}...`);
    
    const synthesis = await synthesizeFile(relPath, text, hash);
    if (!synthesis || synthesis.needsResearch) {
      skipped++;
      continue;
    }

    // Deterministic validation
    const hasExpectedRefInSummary = typeof synthesis.summary === 'string' && synthesis.summary.includes(expectedRef);
    const hasExpectedRefInSourceRefs =
      Array.isArray(synthesis.sourceRefs) && synthesis.sourceRefs.includes(expectedRef);
    if (!hasExpectedRefInSummary && !hasExpectedRefInSourceRefs) {
      console.warn(`[!] Skipping ${relPath}: LLM failed to include sourceRef in summary/sourceRefs.`);
      skipped++;
      continue;
    }

    if (!dryRun) {
      await db.insert(engramCards).values({
        memoryId: `atlas_card_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        scope: 'codebase',
        summary: synthesis.summary,
        labels: ['atlas_card', 'trust_tier:local_verified', ...synthesis.tags],
        relatedPaths: [relPath],
        sourceRefs: [expectedRef],
        ttlSeconds: 86400 * 365, // 1 year
      });
    }

    processed++;
  }

  console.log(`\nAtlas Indexing Complete.`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(console.error);
