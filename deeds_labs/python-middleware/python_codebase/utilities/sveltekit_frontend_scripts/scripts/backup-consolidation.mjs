#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Consolidate JSON backup files from a directory into a single output JSON file.
 * @param {string} dir - Directory containing backup JSON files (default "./backups")
 * @param {string} out - Output file path (default "./backup-consolidated.json")
 * @returns {Promise<{inputFiles:number,output:string}>}
 */
async function consolidateBackups(dir = './backups', out = './backup-consolidated.json') {
  const absDir = path.resolve(dir);
  // Ensure directory exists
  try {
    const stat = await fs.stat(absDir);
    if (!stat.isDirectory()) {
      throw new Error(`${absDir} is not a directory`);
    }
  } catch (err) {
    throw new Error(`Cannot access directory "${absDir}": ${err.message}`);
  }

  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map((e) => e.name);

  const consolidated = [];
  for (const name of files) {
    const full = path.join(absDir, name);
    try {
      const text = await fs.readFile(full, 'utf8');
      const parsed = JSON.parse(text);
      consolidated.push({ file: name, data: parsed });
    } catch (err) {
      // Skip invalid JSON files but continue
      console.warn(`Skipping ${name}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  await fs.writeFile(out, JSON.stringify(consolidated, null, 2), 'utf8');
  return { inputFiles: files.length, output: path.resolve(out) };
}

// If executed directly, run consolidation with CLI args
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dir = args[0] ?? './backups';
  const out = args[1] ?? './backup-consolidated.json';
  try {
    const result = await consolidateBackups(dir, out);
    console.log(`Consolidated ${result.inputFiles} file(s) -> ${result.output}`);
    process.exit(0);
  } catch (err) {
    console.error('Error consolidating backups:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

export default consolidateBackups;
