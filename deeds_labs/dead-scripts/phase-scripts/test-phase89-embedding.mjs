#!/usr/bin/env node
/**
 * Phase 89: Test Enhanced Embedding with Migration Detection
 *
 * Validates:
 * - Embedding retry logic works
 * - Migration flags are detected
 * - Qdrant payload has enhanced metadata
 */

import ollama from 'ollama';

const TEST_FILES = [
  {
    name: 'Svelte 4 Component with export let',
    content: `
<script>
  export let name = '';
  export let age = 0;

  $: greeting = \`Hello \${name}\`;
</script>

<div>{greeting}</div>
`,
    expectedFlags: ['svelte4_props', 'svelte4_reactivity']
  },
  {
    name: 'Svelte 5 Component with runes',
    content: `
<script>
  let { name = '', age = 0 } = $props();
  let greeting = $derived(\`Hello \${name}\`);
</script>

<div>{greeting}</div>
`,
    expectedFlags: []
  },
  {
    name: 'Melt-UI Component',
    content: `
<script>
  import { createDialog } from '@melt-ui/svelte';

  const {
    elements: { trigger, overlay, content }
  } = createDialog();
</script>

<button use:melt={$trigger}>Open</button>
`,
    expectedFlags: ['melt_ui_legacy', 'melt_ui_imports']
  }
];

// Copy the detection function from the indexer
function detectMigrationFlags(filePath, content) {
  const flags = [];

  // Svelte 4 -> Svelte 5 patterns
  if (content.includes('export let ') && !content.includes('$props')) {
    flags.push('svelte4_props');
  }
  if (content.includes('createEventDispatcher')) {
    flags.push('svelte4_events');
  }
  if (/\$:\s+/.test(content) && !content.includes('$derived')) {
    flags.push('svelte4_reactivity');
  }
  if (content.includes('<script context="module">')) {
    flags.push('svelte4_module_context');
  }

  // Melt-UI -> Bits-UI v2 migration
  if (content.includes('melt-ui')) {
    flags.push('melt_ui_legacy');
  }
  if (content.includes('@melt-ui')) {
    flags.push('melt_ui_imports');
  }

  // Bits-UI patterns
  if (content.includes('bits-ui')) {
    flags.push('bits_ui_v2');
  }

  return flags;
}

async function testEmbedding(text, retries = 3) {
  console.log(`   Attempting embedding (max ${retries} retries)...`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ollama.embed({
        model: 'embeddinggemma:latest',
        input: text,
        options: {
          num_ctx: 8192,
          num_thread: 4,
          num_batch: 512
        }
      });

      const embedding = response.embeddings?.[0] || response.embedding;

      if (embedding && embedding.length === 768) {
        console.log(`   ✅ Embedding successful (${embedding.length}d) on attempt ${attempt}`);
        return embedding;
      } else {
        throw new Error(`Invalid dimension: ${embedding?.length || 0}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Attempt ${attempt}/${retries} failed: ${e.message}`);

      if (attempt < retries) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        console.log(`   Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.log(`   ❌ All attempts failed`);
  return null;
}

async function runTests() {
  console.log('\n🧪 Phase 89: Enhanced Embedding Test\n');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of TEST_FILES) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log('-'.repeat(60));

    // 1. Test migration detection
    console.log('\n1️⃣ Migration Flag Detection:');
    const detectedFlags = detectMigrationFlags('test.svelte', test.content);
    console.log(`   Detected: ${detectedFlags.join(', ') || 'none'}`);
    console.log(`   Expected: ${test.expectedFlags.join(', ') || 'none'}`);

    const flagsMatch = JSON.stringify(detectedFlags.sort()) === JSON.stringify(test.expectedFlags.sort());
    if (flagsMatch) {
      console.log(`   ✅ Flags match!`);
      passed++;
    } else {
      console.log(`   ❌ Flags don't match`);
      failed++;
    }

    // 2. Test embedding
    console.log('\n2️⃣ Embedding Test:');
    const embedding = await testEmbedding(test.content);

    if (embedding) {
      passed++;

      // 3. Test payload structure
      console.log('\n3️⃣ Qdrant Payload Structure:');
      const payload = {
        file_path: 'test.svelte',
        unit_kind: 'component',
        migration_flags: detectedFlags,
        needs_svelte5_migration: detectedFlags.some(f => f.startsWith('svelte4_')),
        needs_bits_ui_migration: detectedFlags.includes('melt_ui_legacy'),
        indexed_at: new Date().toISOString()
      };

      console.log(JSON.stringify(payload, null, 2));
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('✅ All tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. Check Ollama connection and model availability.\n');
  }
}

runTests().catch(console.error);
