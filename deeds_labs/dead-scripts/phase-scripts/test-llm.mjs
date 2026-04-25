/**
 * 🧪 LLM Test Runner
 *
 * Simple wrapper for testing LLM providers.
 *
 * Usage:
 *   node scripts/test-llm.mjs --model=claude
 *   node scripts/test-llm.mjs --model=gemini --search
 *   node scripts/test-llm.mjs --model=ollama --prompt "Hello"
 */

import chalk from 'chalk';
import { callLLM } from './llm-router.mjs';

const args = process.argv.slice(2);
const modelArg = args.find(a => a.startsWith('--model='));
const promptArg = args.find(a => a.startsWith('--prompt='));
const useSearch = args.includes('--search');

const provider = modelArg ? modelArg.split('=')[1] : 'ollama';
const prompt = promptArg ? promptArg.split('=')[1] : 'Explain the concept of "Agentic Healing" in software development.';

console.log(chalk.cyan(`\n🧪 Testing LLM Provider: ${provider}`));
console.log(chalk.gray(`   Prompt: "${prompt}"`));
if (useSearch) console.log(chalk.blue(`   🔍 Search Enabled`));

try {
    const start = Date.now();
    const response = await callLLM(prompt, {
        provider,
        useSearch,
        verbose: true
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    console.log(chalk.green(`\n✅ Success (${duration}s)`));
    console.log(chalk.white(response.text));

    if (response.searchUsed) {
        console.log(chalk.blue(`\n🔍 Search Queries: ${response.searchQueries}`));
        if (response.sources?.length) {
            console.log(chalk.gray(`\n📚 Sources:`));
            response.sources.forEach((s, i) => console.log(`   ${i+1}. ${s.title || s.uri}`));
        }
    }

} catch (error) {
    console.error(chalk.red(`\n❌ Failed: ${error.message}`));
    process.exit(1);
}
