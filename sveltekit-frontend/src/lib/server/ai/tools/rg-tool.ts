import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  executeEnhancedRgSearch,
  type RgSearchResult,
} from '$lib/server/indexer/rg-search-utility.js';

export interface RgToolInput {
  query: string;
  searchPath?: string;
  limit?: number;
}

export interface RgToolOutput {
  query: string;
  searchPath: string;
  llm_output: string;
  matches: RgSearchResult[];
  sourceRefs: string[];
}

function normalizeSearchPath(searchPath?: string): string {
  if (searchPath?.trim()) return searchPath;
  return path.join(process.cwd(), 'src');
}

function toSourceRefs(matches: RgSearchResult[]): string[] {
  return matches.map((m) => `${m.file}:${m.line}`);
}

export async function runRgTool(input: RgToolInput): Promise<RgToolOutput> {
  const query = input.query.trim();
  const searchPath = normalizeSearchPath(input.searchPath);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200);

  if (!query) {
    return {
      query,
      searchPath,
      llm_output: '',
      matches: [],
      sourceRefs: [],
    };
  }

  // Model-related search patterns
  const modelPattern = /gguf|gemma|rotor|quant|bifrost|draft|mtp|safetensors|\.bin/i;
  let rawMatches: RgSearchResult[] = [];
  let llm_output = '';

  if (modelPattern.test(query)) {
    // Use rg --files -uu | rg <pattern> for model files
    try {
      const filesRaw = execSync('rg --files -uu', { encoding: 'utf8', cwd: process.cwd() });
      const lines = filesRaw.split('\n').filter(Boolean);
      const filtered = lines.filter((line) => modelPattern.test(line));
      rawMatches = filtered.slice(0, limit).map((file, idx) => ({
        file,
        line: 1,
        column: 1,
        text: file,
        timestamp_id: `rg-model-${Date.now()}-${idx}`,
      }));
      llm_output = rawMatches.map((m) => m.file).join('\n');
    } catch (err) {
      // fallback to empty
      rawMatches = [];
      llm_output = '';
    }
  } else {
    rawMatches = executeEnhancedRgSearch(query, searchPath).slice(0, limit);
    llm_output = rawMatches.map((m) => `${m.file}:${m.line}:${m.column}: ${m.text}`).join('\n');
  }

  return {
    query,
    searchPath,
    llm_output,
    matches: rawMatches,
    sourceRefs: toSourceRefs(rawMatches),
  };
}

export const rgTool = {
  name: 'rgSearch',
  description: 'Run sourceRef-backed ripgrep search against local code.',
  execute: runRgTool,
};
