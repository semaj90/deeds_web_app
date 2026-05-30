#!/usr/bin/env node
/**
 * apply-gemma4-titles.mjs
 *
 * Use Gemma4 to generate improved task titles from descriptions + context.
 * Titles should be concise (<80 chars), imperative, and capture essence.
 *
 * Input: .opencode/recommendations/tasks.ndjson
 * Output: tasks-with-improved-titles.ndjson
 */

import { readFileSync, writeFileSync } from 'fs';
import http from 'http';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'gemma4-rotorquant:latest';
const INPUT_FILE = '.opencode/recommendations/tasks.ndjson';
const OUTPUT_FILE = '.opencode/recommendations/tasks-with-improved-titles.ndjson';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SAMPLE_ONLY = args.includes('--sample');

function callGemma4(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      temperature: 0.3,
      top_p: 0.9,
      num_predict: 100,
    });

    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response?.trim() || '');
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🚀 Applying Gemma4 titles to task proposals');
  console.log();

  const lines = readFileSync(INPUT_FILE, 'utf-8')
    .trim()
    .split('\n')
    .filter(l => l);

  const tasks = lines.map(l => JSON.parse(l));
  const toProcess = SAMPLE_ONLY ? tasks.slice(0, 10) : tasks;

  console.log(`[LOAD] ${tasks.length} tasks (processing ${toProcess.length})`);
  console.log();

  const results = [];
  let processedCount = 0;

  for (const task of toProcess) {
    const { description, title: originalTitle, cluster, type } = task;

    // Create a prompt for Gemma4
    const prompt = `Given this task description and context, generate a concise, imperative title (max 80 chars):

Description: ${description.substring(0, 300)}
Cluster: ${cluster}
Type: ${type}

Generate ONLY the title text, no quotes or explanation:`;

    try {
      if (APPLY) {
        const improvedTitle = await callGemma4(prompt);
        task.title_improved = improvedTitle;
        task.title_original = originalTitle;
        results.push(task);
        processedCount++;
        console.log(`[${processedCount}/${toProcess.length}] ${improvedTitle}`);
      } else {
        // DRY-RUN: show what would happen
        if (processedCount < 3) {
          console.log(`[DRY-RUN] Task: "${originalTitle}"`);
          console.log(`         Cluster: ${cluster}, Type: ${type}`);
          console.log(`         Would call Gemma4 to generate improved title`);
          console.log();
        }
        results.push(task);
        processedCount++;
      }
    } catch (e) {
      console.warn(`[ERROR] Task ${task.task_id}: ${e.message}`);
      results.push(task);
      processedCount++;
    }
  }

  // Output results
  console.log();
  console.log(`[OUTPUT] Writing ${results.length} tasks to ${OUTPUT_FILE}`);

  let ndjson = '';
  for (const task of results) {
    ndjson += JSON.stringify(task) + '\n';
  }

  writeFileSync(OUTPUT_FILE, ndjson);
  console.log('[WRITE] ✓ Complete');

  if (APPLY) {
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Applied Gemma4 titles to ${processedCount}/${toProcess.length} tasks`);
    console.log(`Output: ${OUTPUT_FILE}`);
    console.log();
    console.log('Sample improved titles:');
    results.slice(0, 3).forEach(t => {
      console.log(`  "${t.title_improved || t.title}"`);
    });
  } else {
    console.log();
    console.log('[DRY-RUN] To apply titles with Gemma4, run:');
    console.log(`  OLLAMA_URL=http://localhost:11434 node scripts/opencode/apply-gemma4-titles.mjs --apply`);
  }
}

main().catch(console.error);
