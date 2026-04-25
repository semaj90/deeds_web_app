#!/usr/bin/env node
/**
 * Phase 77 FINAL: Create Ultimate Gemma3-Legal Mega Dataset
 *
 * Combines ALL training data from every source:
 * - training-data/*.jsonl (Phase 77 generated)
 * - Root *.jsonl files (previous training data)
 * - Deduplication + quality filtering
 * - Optimized for gemma3-legal:latest fine-tuning
 *
 * Target: 400-600 high-quality examples
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OUTPUT_FILE = 'GEMMA3-LEGAL-MEGA-TRAINING.jsonl';

/**
 * Load all JSONL files from a directory
 */
async function loadAllJSONL(pattern) {
  const files = await glob(pattern, { cwd: rootDir });
  const allExamples = [];

  for (const file of files) {
    const filePath = path.join(rootDir, file);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size < 100) continue; // Skip empty files

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const example = JSON.parse(line);
          allExamples.push({
            data: example,
            source: path.basename(file)
          });
        } catch (err) {
          // Skip invalid JSON
        }
      }
    } catch (err) {
      // Skip missing files
    }
  }

  return allExamples;
}

/**
 * Normalize to chat format
 */
function normalizeExample(example) {
  const data = example.data;

  // Already in chat format
  if (data.messages && Array.isArray(data.messages)) {
    return {
      messages: data.messages,
      metadata: {
        ...data.metadata,
        source: example.source
      }
    };
  }

  // Instruction format
  if (data.instruction) {
    const messages = [
      {
        role: 'user',
        content: data.input
          ? `${data.instruction}\n\n${data.input}`
          : data.instruction
      },
      {
        role: 'assistant',
        content: data.output
      }
    ];

    return {
      messages,
      metadata: {
        ...data.metadata,
        source: example.source,
        originalFormat: 'instruction'
      }
    };
  }

  // Text format
  if (data.text) {
    return {
      messages: [
        { role: 'user', content: 'Continue:' },
        { role: 'assistant', content: data.text }
      ],
      metadata: {
        source: example.source,
        originalFormat: 'text'
      }
    };
  }

  return null;
}

/**
 * Generate content hash for deduplication
 */
function hashContent(normalized) {
  const content = normalized.messages
    .map(m => `${m.role}:${m.content}`)
    .join('|');
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Quality filter
 */
function isHighQuality(normalized) {
  if (!normalized?.messages) return false;

  const assistant = normalized.messages.find(m => m.role === 'assistant');
  const user = normalized.messages.find(m => m.role === 'user');

  // Must have meaningful assistant response (>20 chars)
  if (!assistant || assistant.content.length < 20) return false;

  // Must have meaningful user message (>5 chars)
  if (!user || user.content.length < 5) return false;

  // Filter out test/debug messages
  const testPatterns = [
    /^test$/i,
    /^debug$/i,
    /^hello$/i,
    /^hi$/i
  ];

  if (testPatterns.some(p => p.test(user.content))) return false;

  return true;
}

/**
 * Add system prompt
 */
function enhanceWithSystem(normalized) {
  const messages = [...normalized.messages];

  // Add system prompt if missing
  if (!messages.find(m => m.role === 'system')) {
    messages.unshift({
      role: 'system',
      content: 'You are gemma3-legal, a specialized AI assistant expert in full-stack legal tech development. You have deep knowledge of SvelteKit, Svelte 5, TypeScript, Python, Go microservices, CUDA/WebGPU, and legal document processing. Provide accurate, production-ready code with detailed explanations.'
    });
  }

  return {
    ...normalized,
    messages
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 77 FINAL: Gemma3-Legal MEGA Training Dataset           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Load from both locations
  console.log('📊 Loading training data...\n');

  const trainingDataExamples = await loadAllJSONL('training-data/*.jsonl');
  console.log(`   ✅ Loaded ${trainingDataExamples.length} examples from training-data/`);

  const rootExamples = await loadAllJSONL('*training*.jsonl');
  console.log(`   ✅ Loaded ${rootExamples.length} examples from root directory`);

  const allExamples = [...trainingDataExamples, ...rootExamples];
  console.log(`\n📝 Total raw examples: ${allExamples.length}`);

  // Normalize
  console.log('\n🔄 Normalizing to chat format...');
  const normalized = allExamples
    .map(normalizeExample)
    .filter(Boolean);
  console.log(`   ✅ Normalized ${normalized.length} examples`);

  // Deduplicate
  console.log('\n🔍 Deduplicating...');
  const seen = new Set();
  const deduplicated = normalized.filter(ex => {
    const hash = hashContent(ex);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
  console.log(`   ✅ Removed ${normalized.length - deduplicated.length} duplicates`);

  // Quality filter
  console.log('\n✨ Applying quality filters...');
  const highQuality = deduplicated.filter(isHighQuality);
  console.log(`   ✅ Kept ${highQuality.length} high-quality examples`);
  console.log(`   ❌ Filtered ${deduplicated.length - highQuality.length} low-quality`);

  // Enhance
  console.log('\n⚙️  Adding system prompts...');
  const enhanced = highQuality.map(enhanceWithSystem);

  // Write output
  console.log('\n💾 Writing mega dataset...');
  const outputPath = path.join(rootDir, OUTPUT_FILE);
  const outputLines = enhanced.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(outputPath, outputLines, 'utf-8');

  const stats = await fs.stat(outputPath);
  const sizeKB = (stats.size / 1024).toFixed(1);

  console.log(`   ✅ ${OUTPUT_FILE}`);
  console.log(`   📊 ${enhanced.length} examples`);
  console.log(`   📦 ${sizeKB} KB`);

  // Category analysis
  console.log('\n📂 Category Breakdown:');
  const categories = {};
  enhanced.forEach(ex => {
    const category = ex.metadata?.category || 'general';
    categories[category] = (categories[category] || 0) + 1;
  });

  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([cat, count]) => {
      const pct = ((count / enhanced.length) * 100).toFixed(1);
      console.log(`   ${cat.padEnd(35)} ${count.toString().padStart(4)} (${pct}%)`);
    });

  // Source analysis
  console.log('\n📁 Source File Breakdown:');
  const sources = {};
  enhanced.forEach(ex => {
    const source = ex.metadata?.source || 'unknown';
    sources[source] = (sources[source] || 0) + 1;
  });

  Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([src, count]) => {
      console.log(`   ${src.padEnd(45)} ${count.toString().padStart(4)} examples`);
    });

  // Training recommendations
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  MEGA Dataset Ready for Fine-Tuning!                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('🚀 Recommended Training Configuration:\n');
  console.log(`   Dataset:            ${OUTPUT_FILE}`);
  console.log(`   Examples:           ${enhanced.length}`);
  console.log(`   Size:               ${sizeKB} KB`);
  console.log(`   Base Model:         gemma-2-27b-it-bnb-4bit`);
  console.log(`   Method:             QLoRA (4-bit quantization)`);
  console.log(`   Batch Size:         4-8`);
  console.log(`   Gradient Accum:     4`);
  console.log(`   Learning Rate:      2e-5`);
  console.log(`   Epochs:             3-5`);

  const stepsPerEpoch = Math.ceil(enhanced.length / 4); // batch size 4
  const totalSteps = stepsPerEpoch * 4; // 4 epochs
  console.log(`   Steps per Epoch:    ${stepsPerEpoch}`);
  console.log(`   Total Steps:        ${totalSteps}`);
  console.log(`   Training Time:      ~${Math.ceil(totalSteps / 20)}-${Math.ceil(totalSteps / 15)} minutes (A100 GPU)\n`);

  console.log('📋 Next Steps:\n');
  console.log(`   1. Upload ${OUTPUT_FILE} to Google Colab`);
  console.log('   2. Run Unsloth fine-tuning script');
  console.log('   3. Export to GGUF (q4_k_m quantization)');
  console.log('   4. Load into Ollama as gemma3-legal:mega-finetuned\n');

  // Quality metrics
  const avgUserLen = enhanced.reduce((sum, ex) => {
    const user = ex.messages.find(m => m.role === 'user');
    return sum + (user?.content.length || 0);
  }, 0) / enhanced.length;

  const avgAssistantLen = enhanced.reduce((sum, ex) => {
    const assistant = ex.messages.find(m => m.role === 'assistant');
    return sum + (assistant?.content.length || 0);
  }, 0) / enhanced.length;

  console.log('📊 Quality Metrics:\n');
  console.log(`   Avg User Message:       ${Math.round(avgUserLen)} chars`);
  console.log(`   Avg Assistant Response: ${Math.round(avgAssistantLen)} chars`);
  console.log(`   Deduplication Rate:     ${((1 - enhanced.length / allExamples.length) * 100).toFixed(1)}%`);
  console.log(`   Quality Pass Rate:      ${((highQuality.length / deduplicated.length) * 100).toFixed(1)}%\n`);

  console.log('✅ MEGA Dataset Complete!\n');
}

main().catch(console.error);
