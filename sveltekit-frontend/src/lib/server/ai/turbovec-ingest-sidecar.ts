import path from 'node:path';
import fs from 'node:fs';
import { executeEnhancedRgSearch } from '../indexer/rg-search-utility.js';
import { inferIntent } from '../../intent/regex-intent.js';

export interface TurbovecSidecarContext {
  intent: string;
  confidence: number;
  keywords: string[];
  matches: Array<{
    file: string;
    line: number;
    text: string;
  }>;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'this', 'that', 'with', 'from',
  'our', 'what', 'how', 'why', 'who', 'show', 'list', 'task', 'todo', 'work', 'please'
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9_\-\/]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * Runs a CPU-optimized pre-ingestion pipeline to locate relevant task state
 * and intent details before calling standard generation.
 */
export async function runTurbovecPreIngestion(
  query: string,
  options: { userId?: string; filePath?: string } = {}
): Promise<string> {
  const intent = inferIntent(query);
  const keywords = extractKeywords(query);

  const matchedLines: Array<{ file: string; line: number; text: string }> = [];

  // Search in known project planning files
  const searchFiles = ['TODO_ATLAS.md', 'AGENTS.md', 'task.md'];
  const cwd = process.cwd();
  
  // Also try to read the task.md artifact if we can resolve the brain directory
  const brainPath = process.env.BRAIN_PATH || 'C:\\Users\\james\\.gemini\\antigravity\\brain\\a6e1254c-af9a-4552-8da8-334354c5959d';

  // Perform Ripgrep search for each extracted keyword in the root folder
  const termsToSearch = keywords.slice(0, 3);
  if (termsToSearch.length === 0) {
    termsToSearch.push('todo');
  }

  for (const term of termsToSearch) {
    // Search in workspace root (one level up from sveltekit-frontend)
    const rootSearchPath = path.resolve(cwd, '..');
    const results = executeEnhancedRgSearch(term, rootSearchPath);
    
    for (const res of results) {
      const baseName = path.basename(res.file);
      if (searchFiles.includes(baseName)) {
        matchedLines.push({
          file: baseName,
          line: res.line,
          text: res.text,
        });
      }
    }

    // Search task.md in brain directory explicitly if it exists
    if (fs.existsSync(path.join(brainPath, 'task.md'))) {
      const brainResults = executeEnhancedRgSearch(term, path.join(brainPath, 'task.md'));
      for (const res of brainResults) {
        matchedLines.push({
          file: 'brain/task.md',
          line: res.line,
          text: res.text,
        });
      }
    }
  }

  // Deduplicate and cap matches to prevent context bloat
  const seen = new Set<string>();
  const uniqueMatches = matchedLines
    .filter((m) => {
      const key = `${m.file}:${m.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  // Construct structured sidecar markdown
  let sidecar = `=== TURBOVEC PRE-INGEST SCAN ===\n`;
  sidecar += `Detected Intent: ${intent.label} (confidence: ${intent.confidence.toFixed(2)})\n`;
  sidecar += `Search Terms: ${termsToSearch.join(', ')}\n\n`;

  if (uniqueMatches.length > 0) {
    sidecar += `Active Task & Goal References:\n`;
    for (const match of uniqueMatches) {
      sidecar += `- [${match.file}:${match.line}] ${match.text}\n`;
    }
  } else {
    sidecar += `No direct task references found for terms.\n`;
  }
  sidecar += `================================\n`;

  return sidecar;
}
