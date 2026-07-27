#!/usr/bin/env tsx
/**
 * Batch C Real Lexical Lane: ast-grep Pattern Matching
 * Uses ast-grep CLI to extract real code patterns from source files
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

interface LexicalObservation {
  pattern_type: string;
  match_text: string;
  confidence: number;
  source: string;
}

/**
 * Extract lexical patterns using ast-grep
 * Searches for common TypeScript/JavaScript patterns
 */
async function extractLexicalPatterns(filePath: string): Promise<LexicalObservation[]> {
  const observations: LexicalObservation[] = [];

  // Guard: file must exist
  if (!fs.existsSync(filePath)) {
    return observations;
  }

  // Define ast-grep patterns to search for
  // Using simpler patterns that work with ast-grep's TypeScript parser
  const patterns = [
    {
      name: 'function_declaration',
      pattern: 'function $_() {}',
      confidence: 0.95,
    },
    {
      name: 'async_function',
      pattern: 'async function $_() {}',
      confidence: 0.95,
    },
    {
      name: 'arrow_function_const',
      pattern: 'const $_ = () => {}',
      confidence: 0.90,
    },
    {
      name: 'class_declaration',
      pattern: 'class $_ {}',
      confidence: 0.95,
    },
    {
      name: 'export_statement',
      pattern: 'export $_',
      confidence: 0.98,
    },
    {
      name: 'import_statement',
      pattern: 'import $_',
      confidence: 0.98,
    },
    {
      name: 'const_declaration',
      pattern: 'const $_ = $_',
      confidence: 0.85,
    },
    {
      name: 'interface_declaration',
      pattern: 'interface $_ {}',
      confidence: 0.95,
    },
    {
      name: 'type_declaration',
      pattern: 'type $_ = $_',
      confidence: 0.95,
    },
  ];

  // Run ast-grep for each pattern
  for (const patternDef of patterns) {
    try {
      // ast-grep CLI: scan file for pattern
      const cmd = `ast-grep --pattern '${patternDef.pattern.replace(/'/g, "'\\''")}' '${filePath}' --json`;
      const output = execSync(cmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr
      });

      if (output && output.trim()) {
        try {
          const result = JSON.parse(output);

          // Handle both array and object results from ast-grep
          const matches = Array.isArray(result) ? result : result.matches || [];

          for (const match of matches) {
            observations.push({
              pattern_type: patternDef.name,
              match_text: match.text || match.matched_text || String(match).slice(0, 50),
              confidence: patternDef.confidence,
              source: 'ast-grep',
            });
          }
        } catch {
          // JSON parse failed, skip this result
        }
      }
    } catch (err) {
      // ast-grep execution failed (e.g., pattern not found), skip this pattern
    }
  }

  return observations;
}

/**
 * Aggregate lexical observations
 * Returns summary of patterns found in file
 */
function aggregateLexicalObservations(
  observations: LexicalObservation[]
): string {
  if (observations.length === 0) {
    return 'lexical:no-patterns-found';
  }

  const patternCounts: Record<string, number> = {};
  let totalConfidence = 0;

  for (const obs of observations) {
    patternCounts[obs.pattern_type] = (patternCounts[obs.pattern_type] || 0) + 1;
    totalConfidence += obs.confidence;
  }

  const avgConfidence = totalConfidence / Math.max(observations.length, 1);
  const topPatterns = Object.entries(patternCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([p, c]) => `${p}(${c})`)
    .join(',');

  return `lexical:${topPatterns}|conf:${avgConfidence.toFixed(2)}`;
}

// Test run: extract patterns from a sample file
async function testLexicalExtraction() {
  const testFile = 'src/lib/server/db/client.ts';

  console.log(`[Lexical] Testing ast-grep extraction on ${testFile}...`);

  if (!fs.existsSync(testFile)) {
    console.log(`[Lexical] File not found: ${testFile}`);
    process.exit(1);
  }

  try {
    const observations = await extractLexicalPatterns(testFile);
    console.log(`[Lexical] Found ${observations.length} pattern matches`);

    if (observations.length > 0) {
      console.log(`[Lexical] Top patterns:`);
      observations.slice(0, 5).forEach((obs) => {
        console.log(`  - ${obs.pattern_type}: ${obs.match_text.slice(0, 40)}... (conf: ${obs.confidence})`);
      });
    }

    const aggregated = aggregateLexicalObservations(observations);
    console.log(`[Lexical] Aggregated: ${aggregated}`);

    process.exit(0);
  } catch (err) {
    console.error(`[Lexical] ERROR: ${(err as Error).message}`);
    process.exit(1);
  }
}

testLexicalExtraction();
