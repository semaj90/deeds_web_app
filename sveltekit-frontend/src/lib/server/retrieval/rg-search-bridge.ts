/**
 * RG Search Bridge — Ripgrep CLI Wrapper
 *
 * Purpose: Execute ripgrep CLI for fast keyword/regex search across codebase
 * Output: List of matching files + line numbers + context
 * Performance: 10-100× faster than Node.js string matching
 *
 * Used by: Reranker as Signal 3 (0.30 weight in blend)
 */

import { execSync, spawnSync } from 'child_process';
import path from 'path';

export interface RgMatch {
  file: string;
  lineNum: number;
  context: string;
  confidence: number; // 0-1, based on query terms found
}

const REPO_ROOT = path.resolve(process.cwd(), '..');

/**
 * Execute ripgrep search
 * @param query User query string (will be converted to regex pattern)
 * @param options Search options
 * @returns Array of matches with context
 */
export async function rgKeywordSearch(
  query: string,
  options: {
    limit?: number;
    filetypes?: string[];
    ignorePatterns?: string[];
  } = {}
): Promise<RgMatch[]> {
  const { limit = 100, filetypes = ['ts', 'tsx', 'js', 'jsx'], ignorePatterns = [] } = options;

  try {
    // Sanitize query: escape special regex chars, split on whitespace
    const queryTerms = query
      .split(/\s+/)
      .filter(t => t.length > 2)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (queryTerms.length === 0) {
      return [];
    }

    // Build rg command
    // Strategy: search for ANY term (OR), then filter on relevance
    const rgPattern = queryTerms.join('|');
    const typeArgs = filetypes.flatMap(t => ['--type', t]);

    const cmd = [
      'rg',
      '--json',
      '-i', // case-insensitive
      '--max-count=5', // max 5 matches per file
      '-A', '2', // 2 lines after match
      '-B', '1', // 1 line before match
      rgPattern,
      REPO_ROOT,
      ...typeArgs,
    ];

    // Execute rg
    const result = spawnSync(cmd[0], cmd.slice(1), {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 30000,
    });

    if (result.error && result.error.code === 'ENOENT') {
      console.warn('⚠️  ripgrep not installed. Falling back to empty results.');
      return [];
    }

    if (result.error) {
      console.error('ripgrep error:', result.error.message);
      return [];
    }

    // Parse JSON output from rg
    const matches: RgMatch[] = [];
    const lines = result.stdout.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === 'match') {
          const { path: filepath, line: lineNum, lines: contextLines } = entry.data;
          const context = contextLines.text || '';

          // Count how many query terms appear in context (for confidence)
          const termMatches = queryTerms.filter(t => context.toLowerCase().includes(t.toLowerCase())).length;
          const confidence = Math.min(1.0, termMatches / queryTerms.length);

          matches.push({
            file: filepath,
            lineNum,
            context,
            confidence,
          });
        }
      } catch (e) {
        // Skip malformed JSON lines
      }
    }

    // Sort by confidence, limit results
    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  } catch (err) {
    console.error('rgKeywordSearch error:', err);
    return [];
  }
}

/**
 * Extract keyword confidence score from rg results
 * Used by reranker to normalize rg signal
 */
export function normalizeRgScore(matches: RgMatch[], queryTermCount: number): number {
  if (matches.length === 0) {
    return 0;
  }

  // Average confidence × match count boost
  const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
  const matchBoost = Math.min(1.0, matches.length / 5); // boost if many matches

  return avgConfidence * (0.5 + 0.5 * matchBoost);
}
