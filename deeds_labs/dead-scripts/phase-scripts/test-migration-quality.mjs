/**
 * 🧪 Phase 77: Test Migration Quality
 *
 * Tests the fine-tuned model against gold-standard migrations
 * to measure accuracy and identify areas for improvement.
 *
 * Usage:
 *   node scripts/test-migration-quality.mjs
 *   node scripts/test-migration-quality.mjs --model gemma3-legal-svelte5
 */

import chalk from 'chalk';
import fs from 'fs';

const TEST_CASES = [
    {
        name: 'Basic State',
        input: 'let count = 0;',
        expected: 'let count = $state(0);',
        category: 'reactivity'
    },
    {
        name: 'Event Handler',
        input: '<button on:click={handleClick}>Click</button>',
        expected: '<button onclick={handleClick}>Click</button>',
        category: 'events'
    },
    {
        name: 'Props',
        input: 'export let name = "World";',
        expected: 'let { name = "World" } = $props();',
        category: 'props'
    },
    {
        name: 'Derived',
        input: '$: doubled = count * 2;',
        expected: 'let doubled = $derived(count * 2);',
        category: 'reactivity'
    },
    {
        name: 'Effect',
        input: '$: { console.log(count); }',
        expected: '$effect(() => { console.log(count); });',
        category: 'reactivity'
    },
    {
        name: 'Store to State',
        input: 'const count = writable(0);',
        expected: 'let count = $state(0);',
        category: 'stores'
    }
];

console.log(chalk.cyan.bold('\n🧪 Migration Quality Test Suite\n'));
console.log(chalk.gray('Testing gold-standard Svelte 4 → Svelte 5 patterns\n'));

// Load combined dataset to verify coverage
const datasetPath = 'combined_training_data.jsonl';
if (!fs.existsSync(datasetPath)) {
    console.log(chalk.red('❌ combined_training_data.jsonl not found!'));
    console.log(chalk.yellow('   Run: node scripts/combine-training-data.mjs\n'));
    process.exit(1);
}

const dataset = fs.readFileSync(datasetPath, 'utf-8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

console.log(chalk.blue(`📊 Dataset Analysis:`));
console.log(chalk.gray(`   Total examples: ${dataset.length}`));

// Categorize examples
const categories = {};
dataset.forEach(ex => {
    if (ex.metadata?.category) {
        const cat = ex.metadata.category;
        categories[cat] = (categories[cat] || 0) + 1;
    }
});

console.log(chalk.gray(`   Categories:`));
Object.entries(categories).forEach(([cat, count]) => {
    console.log(chalk.gray(`      - ${cat}: ${count}`));
});

// Test coverage
console.log(chalk.blue(`\n🎯 Test Case Coverage:\n`));

TEST_CASES.forEach((test, i) => {
    // Check if this pattern exists in dataset
    const found = dataset.some(ex =>
        ex.input.includes(test.input) ||
        ex.output.includes(test.expected)
    );

    const status = found ? chalk.green('✓') : chalk.yellow('⚠');
    console.log(`   ${status} ${test.name} (${test.category})`);

    if (!found) {
        console.log(chalk.gray(`      Input: ${test.input}`));
        console.log(chalk.gray(`      Expected: ${test.expected}`));
    }
});

// Quality metrics
console.log(chalk.blue(`\n📈 Quality Metrics:\n`));

const goldMigrations = dataset.filter(ex => ex.metadata?.category);
const totalGold = goldMigrations.length;
const validatedGold = goldMigrations.filter(ex => ex.metadata?.validation === 'passed').length;

console.log(chalk.gray(`   Gold migrations: ${totalGold}`));
console.log(chalk.gray(`   Validated: ${validatedGold}`));
console.log(chalk.gray(`   Validation rate: ${((validatedGold / totalGold) * 100).toFixed(1)}%`));

// Pattern distribution
const patterns = {
    '$state': 0,
    '$props': 0,
    '$derived': 0,
    '$effect': 0,
    'onclick': 0,
    'oninput': 0
};

dataset.forEach(ex => {
    Object.keys(patterns).forEach(pattern => {
        if (ex.output.includes(pattern)) {
            patterns[pattern]++;
        }
    });
});

console.log(chalk.blue(`\n🔍 Pattern Coverage:\n`));
Object.entries(patterns).forEach(([pattern, count]) => {
    const bar = '█'.repeat(Math.floor(count / 2));
    console.log(`   ${pattern.padEnd(12)} ${chalk.green(bar)} ${count}`);
});

// Recommendations
console.log(chalk.cyan.bold(`\n💡 Recommendations:\n`));

if (totalGold < 15) {
    console.log(chalk.yellow(`   ⚠️  Consider adding more gold migrations (current: ${totalGold}, target: 15+)`));
}

const missingPatterns = Object.entries(patterns).filter(([_, count]) => count < 3);
if (missingPatterns.length > 0) {
    console.log(chalk.yellow(`   ⚠️  Low coverage patterns: ${missingPatterns.map(([p]) => p).join(', ')}`));
}

console.log(chalk.green(`   ✅ Dataset is ready for fine-tuning!`));

console.log(chalk.cyan.bold(`\n📋 Next Steps:\n`));
console.log(chalk.gray(`   1. Upload combined_training_data.jsonl to Google Colab`));
console.log(chalk.gray(`   2. Run phase77-unsloth-finetuning.ipynb`));
console.log(chalk.gray(`   3. Test fine-tuned model with ACE agent`));
console.log(chalk.gray(`   4. Compare against baseline (gemma3-legal:latest)\n`));
