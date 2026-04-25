#!/usr/bin/env node
/**
 * Phase 77: Extract Svelte 5 Official Docs Training Data
 *
 * Parses svelte-complete.txt to create structured training examples
 * for every Svelte 5 feature, rune, and pattern.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SVELTE_DOCS = path.join(rootDir, '..', 'svelte-complete.txt');
const OUTPUT_FILE = path.join(rootDir, 'training-data', 'svelte5-official-docs.jsonl');

/**
 * Parse markdown sections from svelte-complete.txt
 */
async function parseSvelteDocs() {
  const content = await fs.readFile(SVELTE_DOCS, 'utf-8');
  const sections = [];

  // Split by markdown headers
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    // H2 or H3 header
    if (line.startsWith('## ') || line.startsWith('### ')) {
      if (currentSection) {
        sections.push({
          title: currentSection,
          content: currentContent.join('\n').trim(),
        });
      }
      currentSection = line.replace(/^#+\s+/, '');
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Add last section
  if (currentSection) {
    sections.push({
      title: currentSection,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Extract code examples from content
 */
function extractCodeBlocks(content) {
  const blocks = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || 'svelte',
      code: match[2].trim(),
    });
  }

  return blocks;
}

/**
 * Generate training examples from sections
 */
function generateTrainingExamples(sections) {
  const examples = [];

  // Rune-specific sections
  const runeMap = {
    '$state': 'reactive state management',
    '$derived': 'computed values',
    '$effect': 'side effects and lifecycle',
    '$props': 'component properties',
    '$bindable': 'two-way binding',
    '$inspect': 'debugging reactive state',
    '$host': 'custom element host access',
  };

  for (const [rune, description] of Object.entries(runeMap)) {
    // Match by title OR content containing the rune
    const runeSections = sections.filter(s =>
      s.title.includes(rune) || s.content.includes(rune)
    );
    if (runeSections.length === 0) continue;

    for (const runeSection of runeSections.slice(0, 3)) { // Max 3 sections per rune

    const codeBlocks = extractCodeBlocks(runeSection.content);

    // Create examples for each code block
    codeBlocks.forEach((block, idx) => {
      if (block.code.length < 20) return; // Skip tiny examples

      examples.push({
        messages: [
          {
            role: 'system',
            content: `You are an expert Svelte 5 developer. You explain runes clearly with practical examples.`,
          },
          {
            role: 'user',
            content: `Explain how to use ${rune} in Svelte 5 for ${description}.`,
          },
          {
            role: 'assistant',
            content: `The \`${rune}\` rune is used for ${description} in Svelte 5.

Here's a practical example:

\`\`\`${block.language}
${block.code}
\`\`\`

${extractExplanation(runeSection.content, block.code)}`,
          },
        ],
        metadata: {
          category: 'svelte5-official',
          rune,
          tags: ['svelte5', 'runes', 'official-docs'],
          section: runeSection.title,
        },
      });
    });

    // Fallback: if no code blocks, create summary example
    if (codeBlocks.length === 0 && runeSection.content.length > 50) {
      examples.push({
        messages: [
          {
            role: 'system',
            content: `You are an expert Svelte 5 developer.`,
          },
          {
            role: 'user',
            content: `What is ${rune} used for in Svelte 5?`,
          },
          {
            role: 'assistant',
            content: `${rune} is used for ${description}.\n\n${runeSection.content.substring(0, 500)}`,
          },
        ],
        metadata: {
          category: 'svelte5-docs-summary',
          rune,
          tags: ['svelte5', 'runes', 'reference'],
          section: runeSection.title,
        },
      });
    }
    } // Close runeSections loop
  }

  // Template syntax examples - match title OR content
  const templateKeywords = ['#if', '#each', '#await', '#key', '{#if', '{#each', '{#await'];
  const templateSections = sections.filter(s => {
    const hasKeywordInTitle = ['if', 'each', 'await', 'key'].some(kw =>
      s.title.toLowerCase().includes(kw)
    );
    const hasKeywordInContent = templateKeywords.some(kw => s.content.includes(kw));
    return hasKeywordInTitle || hasKeywordInContent;
  });

  for (const section of templateSections) {
    const codeBlocks = extractCodeBlocks(section.content);

    codeBlocks.forEach(block => {
      if (block.code.length < 30) return;

      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are an expert in Svelte template syntax and control flow.',
          },
          {
            role: 'user',
            content: `Show me how to use ${section.title} in Svelte.`,
          },
          {
            role: 'assistant',
            content: `Here's how to use ${section.title}:

\`\`\`svelte
${block.code}
\`\`\`

${extractKeyPoints(section.content)}`,
          },
        ],
        metadata: {
          category: 'svelte5-template',
          feature: section.title,
          tags: ['svelte5', 'template-syntax', 'control-flow'],
        },
      });
    });
  }

  // Component patterns
  const componentSections = sections.filter(s =>
    s.title.toLowerCase().includes('component') ||
    s.title.toLowerCase().includes('props') ||
    s.title.toLowerCase().includes('slot')
  );

  for (const section of componentSections) {
    const codeBlocks = extractCodeBlocks(section.content);

    codeBlocks.slice(0, 2).forEach(block => { // First 2 examples
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are an expert in Svelte component architecture.',
          },
          {
            role: 'user',
            content: `How do I work with ${section.title.toLowerCase()} in Svelte 5?`,
          },
          {
            role: 'assistant',
            content: `Here's a pattern for ${section.title.toLowerCase()}:

\`\`\`svelte
${block.code}
\`\`\`

Best practices:
${extractBestPractices(section.content)}`,
          },
        ],
        metadata: {
          category: 'svelte5-components',
          pattern: section.title,
          tags: ['svelte5', 'components', 'architecture'],
        },
      });
    });
  }

  // Reactivity patterns
  const reactivitySections = sections.filter(s =>
    s.content.includes('reactive') ||
    s.title.includes('Dependencies') ||
    s.title.includes('Update propagation')
  );

  for (const section of reactivitySections.slice(0, 5)) {
    const codeBlocks = extractCodeBlocks(section.content);

    codeBlocks.forEach(block => {
      if (block.code.length < 40) return;

      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are an expert in Svelte 5 reactivity and state management.',
          },
          {
            role: 'user',
            content: 'Explain Svelte 5 reactivity patterns.',
          },
          {
            role: 'assistant',
            content: `Svelte 5 uses a push-pull reactivity model:

\`\`\`svelte
${block.code}
\`\`\`

Key concepts:
- State updates trigger immediate notifications (push)
- Derived values recalculate only when read (pull)
- Dependencies are tracked automatically
- Fine-grained updates for optimal performance`,
          },
        ],
        metadata: {
          category: 'svelte5-reactivity',
          tags: ['svelte5', 'reactivity', 'performance'],
        },
      });
    });
  }

  return examples;
}

/**
 * Extract explanation text near code block
 */
function extractExplanation(content, code) {
  const lines = content.split('\n');
  const codeStart = content.indexOf(code);
  if (codeStart === -1) return '';

  // Get 3 paragraphs before code
  const beforeCode = content.slice(0, codeStart);
  const paragraphs = beforeCode.split('\n\n').filter(p => p.trim() && !p.includes('```'));
  return paragraphs.slice(-2).join('\n\n').trim().slice(0, 300);
}

/**
 * Extract key points from content
 */
function extractKeyPoints(content) {
  const points = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
      points.push(line.replace(/^[-*\d.]\s+/, '- '));
    }
  }

  return points.slice(0, 5).join('\n') || 'See official documentation for details.';
}

/**
 * Extract best practices
 */
function extractBestPractices(content) {
  const practices = [];
  const sentences = content.split(/[.!?]\s+/);

  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes('should') ||
        sentence.toLowerCase().includes('recommended') ||
        sentence.toLowerCase().includes('best') ||
        sentence.toLowerCase().includes('avoid')) {
      practices.push(`- ${sentence.trim()}`);
    }
  }

  return practices.slice(0, 4).join('\n') || '- Follow Svelte conventions\n- Use TypeScript for type safety';
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 77: Extract Svelte 5 Official Docs Training Data       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📖 Parsing svelte-complete.txt...');
  const sections = await parseSvelteDocs();
  console.log(`   ✅ Parsed ${sections.length} sections\n`);

  console.log('📝 Generating training examples...');
  const examples = generateTrainingExamples(sections);
  console.log(`   ✅ Generated ${examples.length} examples\n`);

  // Create output directory
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

  // Write JSONL
  const jsonl = examples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(OUTPUT_FILE, jsonl, 'utf-8');

  const fileSize = (jsonl.length / 1024).toFixed(1);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Extraction Complete                                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`   📊 Total Examples:    ${examples.length}`);
  console.log(`   📄 File:              ${path.basename(OUTPUT_FILE)}`);
  console.log(`   📦 Size:              ${fileSize} KB`);
  console.log(`\n   Category Breakdown:`);

  const categories = {};
  examples.forEach(ex => {
    const cat = ex.metadata.category;
    categories[cat] = (categories[cat] || 0) + 1;
  });

  for (const [cat, count] of Object.entries(categories)) {
    console.log(`      ${cat.padEnd(25)} ${count.toString().padStart(3)} examples`);
  }

  console.log('\n✅ Ready for training!\n');
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
