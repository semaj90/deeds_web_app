import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * log-developer-activity.mjs
 * 
 * Logs recent file modifications and exported symbols to a structured JSONL log.
 * Uses 'rg' (ripgrep) and 'awk' (GNU Awk) for high-performance extraction.
 * 
 * This log is consumed by the 'context.prefetch_feature_context' tool to
 * steer retrieval relevance based on real-time developer activity.
 */

const LOG_DIR = 'logs/activity';
const LOG_FILE = join(LOG_DIR, 'user.activity.jsonl');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

async function run() {
  try {
    // 1. Get modified files in the workspace (Git tracked + untracked)
    // We use git status --porcelain for speed.
    const status = execSync('git status --porcelain src/').toString().split('\n');
    const modifiedFiles = status
      .map(line => line.slice(3).trim())
      .filter(f => f && (f.endsWith('.ts') || f.endsWith('.svelte') || f.endsWith('.js')));

    if (modifiedFiles.length === 0) {
      // Fallback: check if anything was modified in the last 10 minutes via find (if available)
      // On Windows with Git Bash / GnuWin32, find works as expected.
      try {
        const findOut = execSync('find src -type f -mmin -10').toString().split('\n');
        modifiedFiles.push(...findOut.filter(f => f && !modifiedFiles.includes(f)));
      } catch { /* ignore if find -mmin fails */ }
    }

    if (modifiedFiles.length === 0) return;

    for (const file of modifiedFiles) {
      if (!existsSync(file)) continue;

      // 2. Use 'rg' and 'awk' to extract exported symbol names
      // rg finds the export lines, awk grabs the last word (the name)
      let symbols = [];
      try {
        const rgCmd = `rg "export (const|function|class|type|interface|enum) \\w+" "${file}" | awk '{print $NF}' | awk -F'[:=(<]' '{print $1}'`;
        symbols = execSync(rgCmd).toString().split('\n').map(s => s.trim()).filter(s => s && s.length > 1);
      } catch { /* ignore rg failures */ }

      // 3. Log the activity entry
      const entry = {
        timestamp: new Date().toISOString(),
        event: 'file_edit',
        filePath: file,
        symbols: Array.from(new Set(symbols)), // dedupe
        lane: 'activity-tracker'
      };

      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    }

    console.log(`[activity] Logged activity for ${modifiedFiles.length} files.`);
  } catch (err) {
    console.error('[activity] Error logging developer activity:', err.message);
  }
}

run();
