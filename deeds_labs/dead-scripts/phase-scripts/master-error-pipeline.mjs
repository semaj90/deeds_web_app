#!/usr/bin/env node
/**
 * Master Error Analysis & Healing Pipeline - Phase 72+
 *
 * Complete end-to-end pipeline:
 * 1. Analyze all files (TS, JS, Svelte, Go, Python, C++)
 * 2. Collect VS Code problems
 * 3. Generate interactive error graph
 * 4. Run agentic healing
 * 5. Generate comprehensive report
 */

import { spawn } from 'child_process';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const skipAnalysis = args.includes('--skip-analysis');
const skipProblems = args.includes('--skip-problems');
const skipGraph = args.includes('--skip-graph');
const skipHealing = args.includes('--skip-healing');
const dryRun = args.includes('--dry-run');

console.log(chalk.cyan.bold('🚀 Master Error Analysis & Healing Pipeline\n'));

const steps = [
	{
		name: 'AST Analysis',
		skip: skipAnalysis,
		command: 'node',
		args: ['scripts/enhanced-ast-analyzer.mjs'],
		description: 'Analyzing all source files...'
	},
	{
		name: 'Problems Collection',
		skip: skipProblems,
		command: 'node',
		args: ['scripts/vscode-problems-collector.mjs'],
		description: 'Collecting VS Code problems...'
	},
	{
		name: 'Error Graph',
		skip: skipGraph,
		command: 'node',
		args: ['scripts/error-graph-visualizer.mjs'],
		description: 'Generating interactive graph...'
	},
	{
		name: 'Agentic Healing',
		skip: skipHealing,
		command: 'node',
		args: ['scripts/agentic-healing-orchestrator.mjs', ...(dryRun ? ['--dry-run'] : [])],
		description: 'Running AI-powered fixes...'
	}
];

let currentStep = 0;

function runStep(step) {
	return new Promise((resolve, reject) => {
		if (step.skip) {
			console.log(chalk.yellow(\`⏭️  Skipping: \${step.name}\n\`));
			resolve();
			return;
		}

		console.log(chalk.cyan.bold(\`\n[\${currentStep + 1}/\${steps.filter(s => !s.skip).length}] \${step.name}\`));
		console.log(chalk.gray(step.description));
		console.log(chalk.gray('─'.repeat(60)));

		const proc = spawn(step.command, step.args, {
			cwd: path.join(__dirname, '..'),
			stdio: 'inherit',
			shell: true
		});

		proc.on('close', (code) => {
			if (code === 0) {
				console.log(chalk.green(\`✅ \${step.name} completed\n\`));
				currentStep++;
				resolve();
			} else {
				console.error(chalk.red(\`❌ \${step.name} failed with code \${code}\n\`));
				reject(new Error(\`\${step.name} failed\`));
			}
		});

		proc.on('error', (err) => {
			console.error(chalk.red(\`❌ Error running \${step.name}: \${err.message}\n\`));
			reject(err);
		});
	});
}

async function runPipeline() {
	const startTime = Date.now();

	try {
		for (const step of steps) {
			await runStep(step);
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(1);

		console.log(chalk.green.bold('\n' + '═'.repeat(60)));
		console.log(chalk.green.bold('✅ Pipeline Complete!'));
		console.log(chalk.green.bold('═'.repeat(60)));
		console.log(chalk.cyan(\`\n⏱️  Total time: \${duration}s\n\`));

		console.log(chalk.white.bold('📊 Generated Reports:\n'));
		console.log(chalk.gray('  • reports/latest/enhanced-ast-kb.tree.json'));
		console.log(chalk.gray('  • reports/latest/vscode-problems.json'));
		console.log(chalk.gray('  • reports/latest/vscode-problems.md'));
		console.log(chalk.gray('  • reports/latest/error-graph.html'));
		console.log(chalk.gray('  • reports/latest/healing-report.json'));
		console.log(chalk.gray('  • reports/latest/healing-report.md\n'));

		console.log(chalk.white.bold('🔗 Quick Actions:\n'));
		console.log(chalk.cyan('  View Error Graph:'));
		console.log(chalk.gray('    start reports/latest/error-graph.html\n'));
		console.log(chalk.cyan('  Send to AI Assistant:'));
		console.log(chalk.gray('    code reports/latest/vscode-problems.md\n'));
		console.log(chalk.cyan('  Review Healing Report:'));
		console.log(chalk.gray('    code reports/latest/healing-report.md\n'));

	} catch (error) {
		console.error(chalk.red.bold(\`\n❌ Pipeline failed: \${error.message}\n\`));
		process.exit(1);
	}
}

runPipeline();
