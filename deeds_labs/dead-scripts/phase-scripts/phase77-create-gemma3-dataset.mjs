#!/usr/bin/env node
/**
 * Phase 77: Create Gemma3-Legal Training Dataset
 *
 * Combines ALL training data sources into one optimized dataset for gemma3-legal:latest
 * Includes:
 * - Full-stack patterns (280 examples from MASTER)
 * - Previous training data (polyglot, enhanced, docs, uiux, svelte5, kb)
 * - Deduplication and quality filtering
 * - Gemma3-specific formatting
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OUTPUT_FILE = path.join(rootDir, 'GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl');

// All source files
const SOURCES = [
  'polyglot_training_data.jsonl',
  'enhanced_training_data.jsonl',
  'docs_training_data.jsonl',
  'uiux_training_data.jsonl',
  'svelte5_training_data.jsonl',
  'kb_training_data.jsonl',
  'combined_training_data.jsonl',
  'training-data/MASTER-TRAINING-COMPLETE.jsonl',
];

/**
 * Load and parse JSONL file
 */
async function loadJSONL(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.warn(`  ⚠️  Parse error in ${path.basename(filePath)} line ${idx + 1}`);
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Generate hash for deduplication
 */
function generateHash(example) {
  // Hash based on content, not metadata
  let content = '';

  if (example.messages) {
    // OpenAI format
    content = example.messages.map(m => m.content).join('|');
  } else if (example.instruction) {
    // Instruction format
    content = `${example.instruction}|${example.input || ''}|${example.output}`;
  } else if (example.text) {
    // Text format
    content = example.text;
  }

  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Normalize to Gemma3 chat format
 */
function normalizeToGemma3Format(example) {
  // Gemma3 expects: { messages: [{role, content}], metadata? }

  if (example.messages) {
    // Already in chat format
    return example;
  }

  if (example.instruction) {
    // Instruction format → chat format
    const messages = [
      {
        role: 'user',
        content: example.input
          ? `${example.instruction}\n\nInput: ${example.input}`
          : example.instruction
      },
      {
        role: 'assistant',
        content: example.output
      }
    ];

    return {
      messages,
      metadata: example.metadata || {}
    };
  }

  if (example.text) {
    // Text format → chat format (assume completion task)
    return {
      messages: [
        { role: 'user', content: 'Continue the following:' },
        { role: 'assistant', content: example.text }
      ],
      metadata: example.metadata || {}
    };
  }

  return example;
}

/**
 * Quality filter
 */
function passesQualityFilter(example) {
  if (!example.messages || !Array.isArray(example.messages)) {
    return false;
  }

  // Must have at least user + assistant
  if (example.messages.length < 2) {
    return false;
  }

  // Assistant response must be meaningful
  const assistant = example.messages.find(m => m.role === 'assistant');
  if (!assistant || assistant.content.length < 20) {
    return false;
  }

  // User message must be meaningful
  const user = example.messages.find(m => m.role === 'user');
  if (!user || user.content.length < 10) {
    return false;
  }

  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 77: Create Gemma3-Legal Training Dataset               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Loading training data sources...\n');

  const allExamples = [];
  const sourceStats = {};

  for (const source of SOURCES) {
    const filePath = path.join(rootDir, source);
    const examples = await loadJSONL(filePath);

    if (examples.length > 0) {
      sourceStats[source] = examples.length;
      allExamples.push(...examples);
      console.log(`   ✅ ${source.padEnd(45)} ${examples.length.toString().padStart(3)} examples`);
    } else {
      console.log(`   ⏭️  ${source.padEnd(45)} (not found or empty)`);
    }
  }

  console.log(`\n📝 Total raw examples: ${allExamples.length}`);

  // Normalize to Gemma3 format
  console.log('\n🔄 Normalizing to Gemma3 chat format...');
  const normalized = allExamples.map(normalizeToGemma3Format);
  console.log(`   ✅ Normalized ${normalized.length} examples`);

  // Deduplicate
  console.log('\n🔍 Deduplicating...');
  const seen = new Set();
  const deduplicated = normalized.filter(example => {
    const hash = generateHash(example);
    if (seen.has(hash)) {
      return false;
    }
    seen.add(hash);
    return true;
  });
  console.log(`   ✅ Removed ${normalized.length - deduplicated.length} duplicates`);

  // Quality filter
  console.log('\n✨ Applying quality filters...');
  const filtered = deduplicated.filter(passesQualityFilter);
  console.log(`   ✅ Kept ${filtered.length} high-quality examples`);
  console.log(`   ❌ Filtered out ${deduplicated.length - filtered.length} low-quality examples`);

  // Add system prompts for Gemma3-legal context
  console.log('\n⚙️  Adding legal AI context to system prompts...');
  const enhanced = filtered.map(example => {
    const messages = [...example.messages];

    // Add system prompt if missing
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: 'You are a specialized legal AI assistant with expertise in SvelteKit full-stack development, TypeScript, WebGPU, CUDA, Go microservices, Python, and legal document processing. Provide accurate, idiomatic code and detailed explanations.'
      });
    }

    return {
      ...example,
      messages
    };
  });

  // Write output
  console.log('\n💾 Writing training dataset...');
  const outputLines = enhanced.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(OUTPUT_FILE, outputLines, 'utf-8');

  const stats = await fs.stat(OUTPUT_FILE);
  const sizeKB = (stats.size / 1024).toFixed(1);

  console.log(`   ✅ ${path.basename(OUTPUT_FILE)}`);
  console.log(`   📊 ${enhanced.length} examples`);
  console.log(`   📦 ${sizeKB} KB`);

  // Category breakdown
  console.log('\n📂 Category Breakdown:');
  const categories = {};
  enhanced.forEach(ex => {
    const category = ex.metadata?.category || 'general';
    categories[category] = (categories[category] || 0) + 1;
  });

  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([cat, count]) => {
      console.log(`   ${cat.padEnd(30)} ${count.toString().padStart(4)} examples`);
    });

  // Training recommendations
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Dataset Ready for Fine-Tuning!                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('🚀 Recommended Training Configuration:\n');
  console.log('   Model:              gemma3-legal:latest (or gemma-2-27b-it)');
  console.log('   Dataset:            GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl');
  console.log(`   Total Examples:     ${enhanced.length}`);
  console.log(`   Estimated Epochs:   3-5`);
  console.log(`   Batch Size:         4-8`);
  console.log(`   Learning Rate:      2e-5`);
  console.log(`   Training Time:      ~20-30 minutes (A100 GPU)`);
  console.log('\n📋 Next Steps:\n');
  console.log('   1. Upload GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl to Google Colab');
  console.log('   2. Use Unsloth for 4-bit quantized training');
  console.log('   3. Fine-tune with LoRA adapters');
  console.log('   4. Merge and export to GGUF format');
  console.log('   5. Load into Ollama as gemma3-legal:latest-finetuned\n');

  console.log('✅ Complete!\n');
}

main().catch(console.error);
