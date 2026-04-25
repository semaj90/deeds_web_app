/**
 * 🔗 Phase 77: Combine Training Datasets
 *
 * Merges:
 * 1. polyglot_training_data.jsonl (45 examples from Qdrant)
 * 2. gold_svelte5_migrations.jsonl (10 gold-standard migrations)
 * 3. enhanced_training_data.jsonl (52 structured examples)
 * 4. docs_training_data.jsonl (33 documentation examples)
 * 5. uiux_training_data.jsonl (11 UI/UX component patterns)
 *
 * Output: combined_training_data.jsonl
 */

import chalk from 'chalk';
import fs from 'fs';

const DATASETS = [
    { file: 'polyglot_training_data.jsonl', label: 'Polyglot (Qdrant)' },
    { file: 'gold_svelte5_migrations.jsonl', label: 'Gold Migrations' },
    { file: 'enhanced_training_data.jsonl', label: 'Enhanced Templates' },
    { file: 'docs_training_data.jsonl', label: 'Documentation Examples' },
    { file: 'uiux_training_data.jsonl', label: 'UI/UX Patterns' }
];

const OUTPUT = 'combined_training_data.jsonl';

console.log(chalk.cyan.bold('\n🔗 Combining Training Datasets\n'));

let totalExamples = 0;
const combined = [];
const stats = {};

for (const { file, label } of DATASETS) {
    if (!fs.existsSync(file)) {
        console.log(chalk.yellow(`⚠️  ${file} not found, skipping...`));
        continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    stats[label] = lines.length;
    totalExamples += lines.length;
    combined.push(...lines);

    console.log(chalk.green(`✅ ${label}: ${lines.length} examples`));
}

// Write combined dataset
fs.writeFileSync(OUTPUT, combined.join('\n'));

console.log(chalk.cyan(`\n📊 Dataset Summary:`));
console.log(chalk.gray(`   Total examples: ${totalExamples}`));
Object.entries(stats).forEach(([label, count]) => {
    const percentage = ((count / totalExamples) * 100).toFixed(1);
    console.log(chalk.gray(`   - ${label}: ${count} (${percentage}%)`));
});
console.log(chalk.gray(`   📂 Output: ${OUTPUT}`));
console.log(chalk.gray(`   📏 Size: ${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB\n`));

// Sample output
console.log(chalk.cyan('📝 Sample Examples:'));
const parsed = combined.slice(0, 3).map(line => JSON.parse(line));
parsed.forEach((ex, i) => {
    console.log(chalk.blue(`\n${i + 1}. ${ex.instruction.substring(0, 60)}...`));
    console.log(chalk.gray(`   Input: ${ex.input.substring(0, 40)}...`));
    console.log(chalk.gray(`   Output length: ${ex.output.length} chars`));
});

console.log(chalk.cyan.bold('\n✅ Ready for Colab Upload!\n'));
