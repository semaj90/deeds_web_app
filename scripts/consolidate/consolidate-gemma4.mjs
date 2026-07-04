#!/usr/bin/env node

/**
 * consolidate-gemma4.mjs
 *
 * Sends duplicate file pairs to Gemma4 for LLM reasoning about consolidation.
 *
 * Usage:
 *   node scripts/consolidate/consolidate-gemma4.mjs [--confidence 0.90] [--verbose]
 *
 * Output:
 *   .tmp/consolidation-summaries.json (Gemma4 reasoning for each merge)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../');
const SVELTEKIT_FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const TMP_DIR = path.join(SVELTEKIT_FRONTEND, '.tmp');

// Parse CLI args
const verbose = process.argv.includes('--verbose');
const confidenceArg = parseFloat(process.argv.find(arg => arg.startsWith('--confidence='))?.split('=')[1] ?? '0.70');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const vlog = (msg) => verbose && log(msg);

// Ensure .tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Check if Gemma4 is available
 */
async function checkGemma4Availability() {
  try {
    const result = execSync('curl -s http://127.0.0.1:11434/api/tags', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const data = JSON.parse(result);
    const hasGemma4 = data.models?.some(m => m.name?.includes('gemma4'));
    if (hasGemma4) {
      vlog('✅ Gemma4 detected at http://127.0.0.1:11434');
      return true;
    }
    log('⚠️  Gemma4 not found in Ollama. Skipping LLM summaries.');
    log('    Ensure the configured Gemma4 runtime is available');
    return false;
  } catch (e) {
    log('⚠️  Ollama not available at http://127.0.0.1:11434');
    log('    Start Ollama: ollama serve');
    return false;
  }
}

/**
 * Load consolidation candidates from audit
 */
function loadCandidates() {
  const candidatesFile = path.join(TMP_DIR, 'consolidation-candidates.json');
  if (!fs.existsSync(candidatesFile)) {
    log('❌ consolidation-candidates.json not found');
    log('   Run: npm run consolidate:audit');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(candidatesFile, 'utf-8'));
  return data.candidates || [];
}

/**
 * Filter candidates by confidence
 */
function filterByConfidence(candidates, minConfidence) {
  return candidates.filter(c => c.confidence >= minConfidence);
}

/**
 * Prompt for Gemma4 reasoning
 */
async function getGemma4Reasoning(canonical, duplicate, confidence) {
  try {
    const prompt = `
Two TypeScript/JavaScript files are candidates for consolidation:

CANONICAL (keep this one):
File: ${canonical.file}
Confidence: ${(confidence * 100).toFixed(1)}%

DUPLICATE (consider deleting this one):
File: ${duplicate}

Task: You are an expert code consolidation assistant.
1. Briefly explain why these files should be merged (based on similarity)
2. List any risks or special handling needed
3. Suggest the consolidation approach (delete duplicate, add re-export shim, etc.)
4. Provide a consolidation confidence score (0.0-1.0) - should it be merged?
5. Any warnings or notes for the human reviewer

Keep your response CONCISE (under 150 words).
Format as JSON: { "reasoning": "...", "risks": [...], "approach": "...", "confidence": 0.95, "warnings": [...] }
`;

    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GEMMA4_MODEL || 'gemma4-legal-iq4xs-direct.gguf',
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 200 }
      })
    });

    const data = await response.json();
    const responseText = data.response || '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return {
          reasoning: responseText.substring(0, 150),
          risks: [],
          approach: 'manual_review',
          confidence: confidence * 0.9,
          warnings: ['Failed to parse Gemma4 JSON response']
        };
      }
    }

    return {
      reasoning: responseText.substring(0, 150),
      risks: [],
      approach: 'manual_review',
      confidence: confidence * 0.9,
      warnings: ['No JSON found in Gemma4 response']
    };
  } catch (e) {
    return {
      reasoning: `Error: ${e.message}`,
      risks: ['Gemma4 unavailable'],
      approach: 'manual_review',
      confidence: confidence * 0.8,
      warnings: ['Gemma4 query failed - use confidence score as guidance']
    };
  }
}

/**
 * Main consolidation summary function
 */
async function generateSummaries() {
  log('🤖 Starting Gemma4 consolidation summaries...');

  // Check Gemma4 availability
  const gemma4Available = await checkGemma4Availability();

  // Load and filter candidates
  const allCandidates = loadCandidates();
  const candidates = filterByConfidence(allCandidates, confidenceArg);

  log(`📊 Processing ${candidates.length} candidates (confidence >= ${confidenceArg})`);

  const summaries = [];
  const startTime = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const percent = ((i + 1) / candidates.length * 100).toFixed(0);

    log(`[${percent}%] Processing: ${candidate.id}`);
    vlog(`  Canonical: ${candidate.canonical}`);
    vlog(`  Duplicates: ${candidate.duplicates.length}`);

    for (const duplicate of candidate.duplicates) {
      vlog(`    - ${duplicate}`);

      let summary = {
        groupId: candidate.id,
        canonical: candidate.canonical,
        duplicate: duplicate.file ?? duplicate,
        confidence: candidate.confidence,
        similarity: duplicate.similarity ?? candidate.avgSimilarity,
        timestamp: new Date().toISOString()
      };

      // Get Gemma4 reasoning if available
      if (gemma4Available) {
        vlog(`    Querying Gemma4...`);
        const gemma4Response = await getGemma4Reasoning(
          { file: candidate.canonical },
          duplicate.file ?? duplicate,
          candidate.confidence
        );
        summary.gemma4 = gemma4Response;
      } else {
        summary.gemma4 = {
          reasoning: 'Gemma4 unavailable - using automatic confidence scoring',
          risks: [],
          approach: 'Use consolidate:audit confidence score for guidance',
          confidence: candidate.confidence * 0.85,
          warnings: ['Gemma4 not running - manual review recommended']
        };
      }

      summaries.push(summary);
    }
  }

  // Write output
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'GEMMA4_SUMMARIES',
    gemma4Available,
    minConfidence: confidenceArg,
    totalGroupsProcessed: candidates.length,
    totalSummariesGenerated: summaries.length,
    executionTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    summaries
  };

  const outputFile = path.join(TMP_DIR, 'consolidation-summaries.json');
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  log(`✅ Summaries generated: ${summaries.length}`);
  log(`📊 Output: ${outputFile}`);
  log(`⏱️  Time: ${report.executionTime}`);

  // Print confidence tier breakdown
  const tierHigh = summaries.filter(s => s.confidence > 0.90).length;
  const tierMed = summaries.filter(s => s.confidence >= 0.70 && s.confidence <= 0.90).length;
  const tierLow = summaries.filter(s => s.confidence < 0.70).length;

  log(`\n📈 Confidence Breakdown:`);
  log(`  HIGH (>0.90):  ${tierHigh} (ready to merge now)`);
  log(`  MEDIUM (0.70): ${tierMed} (review Gemma4 reasoning)`);
  log(`  LOW (<0.70):   ${tierLow} (manual review recommended)`);

  return report;
}

// Run
await generateSummaries().catch(e => {
  log(`❌ Error: ${e.message}`);
  process.exit(1);
});
