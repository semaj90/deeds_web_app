#!/usr/bin/env node
/**
 * VS Code Problems Collector - Phase 72+
 *
 * Collects all VS Code diagnostics (errors/warnings) and:
 * - Exports to JSON for processing
 * - Groups by file, severity, and type
 * - Integrates with AST knowledge base
 * - Prepares for agentic healing
 *
 * Note: This script is designed to be called by VS Code extension or
 * via the get_errors API. For standalone use, it uses tsc and svelte-check.
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'reports/latest/vscode-problems.json';
const includeTsc = !args.includes('--no-tsc');
const includeSvelteCheck = !args.includes('--no-svelte-check');
const includeGo = args.includes('--go');
const includePython = args.includes('--python');
const includeCpp = args.includes('--cpp');

console.log(chalk.cyan.bold('🔍 VS Code Problems Collector\n'));

const problems = {
	timestamp: new Date().toISOString(),
	byFile: {},
	bySeverity: {
		error: [],
		warning: [],
		info: []
	},
	byLanguage: {
		typescript: [],
		javascript: [],
		svelte: [],
		go: [],
		python: [],
		cpp: []
	},
	stats: {
		totalProblems: 0,
		errors: 0,
		warnings: 0,
		info: 0,
		files: 0
	}
};

/**
 * Strip ANSI codes from string
 */
function stripAnsi(str) {
	return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Parse TypeScript compiler output
 */
function collectTypeScriptProblems() {
	console.log(chalk.yellow('📝 Running TypeScript compiler...\n'));

	const tempFile = path.join(__dirname, '..', '.tsc-output.tmp');

	try {
		// Write output to temp file
		execSync(`tsc --noEmit --pretty false > "${tempFile}" 2>&1`, {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8',
			shell: true
		});
	} catch (error) {
		// tsc exits with error code when there are errors, this is expected
	}

	// Read from temp file
	let output = '';
	if (fs.existsSync(tempFile)) {
		output = fs.readFileSync(tempFile, 'utf-8');
		fs.unlinkSync(tempFile);
	}

	// Parse tsc output line by line
	const lines = output.split('\n');
	for (const rawLine of lines) {
		const line = stripAnsi(rawLine).trim();
		if (!line) continue;

		// Format: src/file.ts(123,45): error TS2322: Message
		const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+):\s+(.+)$/);
		if (match) {
			const problem = {
				file: match[1].replace(/\\/g, '/'),
				line: parseInt(match[2]),
				column: parseInt(match[3]),
				severity: match[4],
				code: match[5],
				message: match[6],
				source: 'tsc',
				language: 'typescript'
			};
			addProblem(problem);
		}
	}
}

/**
 * Parse svelte-check output
 */
function collectSvelteProblems() {
	console.log(chalk.yellow('🎨 Running svelte-check...\n'));

	const tempFile = path.join(__dirname, '..', '.svelte-check-output.tmp');

	try {
		// Write output to temp file
		execSync(`npx svelte-check --output machine --threshold warning > "${tempFile}" 2>&1`, {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8',
			shell: true
		});
	} catch (error) {
		// svelte-check exits with error code when there are errors, this is expected
	}

	// Read from temp file
	let output = '';
	if (fs.existsSync(tempFile)) {
		output = fs.readFileSync(tempFile, 'utf-8');
		fs.unlinkSync(tempFile);
	}

	// Parse svelte-check output line by line
	const lines = output.split('\n');
	for (const rawLine of lines) {
		const line = stripAnsi(rawLine).trim();
		if (!line || line.startsWith('Loading') || line.startsWith('Getting')) continue;

		// Format 1: Error: Message (ts) c:\path\to\file.svelte:84:2
		const match1 = line.match(/^(Error|Warn|Hint):\s+(.+?)\s+\((.+?)\)\s+(.+?):(\d+):(\d+)$/i);
		if (match1) {
			const problem = {
				file: match1[4].replace(/\\/g, '/'),
				line: parseInt(match1[5]),
				column: parseInt(match1[6]),
				severity: match1[1].toLowerCase(),
				code: match1[3] || 'svelte',
				message: match1[2].trim(),
				source: 'svelte-check',
				language: 'svelte'
			};
			addProblem(problem);
			continue;
		}

		// Format 2: src/file.svelte:123:45 Error: Message (CODE)
		const match2 = line.match(/^(.+?):(\d+):(\d+)\s+(Error|Warn|Hint):\s+(.+?)(?:\s+\((.+?)\))?$/i);
		if (match2) {
			const problem = {
				file: match2[1].replace(/\\/g, '/'),
				line: parseInt(match2[2]),
				column: parseInt(match2[3]),
				severity: match2[4].toLowerCase(),
				code: match2[6] || 'svelte',
				message: match2[5].trim(),
				source: 'svelte-check',
				language: 'svelte'
			};
			addProblem(problem);
			continue;
		}

		// Format 3: Machine output format
		// TIMESTAMP SEVERITY "FILENAME" LINE:COLUMN "MESSAGE"
		const match3 = line.match(/^\d+\s+(ERROR|WARNING|HINT)\s+"(.+?)"\s+(\d+):(\d+)\s+"(.+?)"/i);
		if (match3) {
			const problem = {
				file: match3[2].replace(/\\/g, '/'),
				line: parseInt(match3[3]),
				column: parseInt(match3[4]),
				severity: match3[1].toLowerCase(),
				code: 'svelte',
				message: match3[5],
				source: 'svelte-check',
				language: 'svelte'
			};
			addProblem(problem);
			continue;
		}
	}
}

/**
 * Parse Go compiler output
 */
function collectGoProblems() {
	console.log(chalk.yellow('🔧 Running Go compiler...\n'));

	const goServices = [
		'../go-services/legal-engine',
		'../go-services/rag-service',
		'../go-services/vite-hmr-bridge'
	];

	goServices.forEach(serviceDir => {
		const fullPath = path.join(__dirname, serviceDir);
		if (!fs.existsSync(fullPath)) return;

		try {
			execSync('go build ./...', {
				cwd: fullPath,
				encoding: 'utf-8',
				stdio: 'pipe'
			});
		} catch (error) {
			const output = error.stdout || error.stderr || '';

			// Parse Go output
			// Format: ./main.go:10:5: undefined: someFunction
			const regex = /(.+?):(\d+):(\d+):\s+(.+)/g;
			let match;

			while ((match = regex.exec(output)) !== null) {
				const [_, file, line, column, message] = match;

				const problem = {
					file: path.join(serviceDir, file),
					line: parseInt(line),
					column: parseInt(column),
					severity: 'error',
					code: 'go',
					message,
					source: 'go',
					language: 'go'
				};

				addProblem(problem);
			}
		}
	});
}

/**
 * Parse Python mypy/pylint output
 */
function collectPythonProblems() {
	console.log(chalk.yellow('🐍 Running Python type checker...\n'));

	const pythonDirs = ['../backend', '../python_codebase'];

	pythonDirs.forEach(pyDir => {
		const fullPath = path.join(__dirname, pyDir);
		if (!fs.existsSync(fullPath)) return;

		try {
			// Try mypy first
			execSync('mypy . --no-error-summary', {
				cwd: fullPath,
				encoding: 'utf-8',
				stdio: 'pipe'
			});
		} catch (error) {
			const output = error.stdout || error.stderr || '';

			// Parse mypy output
			// Format: file.py:10: error: Name 'x' is not defined
			const regex = /(.+?):(\d+):\s+(error|warning|note):\s+(.+)/g;
			let match;

			while ((match = regex.exec(output)) !== null) {
				const [_, file, line, severity, message] = match;

				const problem = {
					file: path.join(pyDir, file),
					line: parseInt(line),
					column: 0,
					severity,
					code: 'mypy',
					message,
					source: 'mypy',
					language: 'python'
				};

				addProblem(problem);
			}
		}
	});
}

/**
 * Parse C++/CUDA compiler output
 */
function collectCppProblems() {
	console.log(chalk.yellow('⚡ Running C++ compiler...\n'));

	// This is a placeholder - actual CUDA/C++ compilation would need proper build system
	console.log(chalk.gray('  (C++ compilation skipped - requires CMake/nvcc setup)\n'));
}

/**
 * Add a problem to the collection
 */
function addProblem(problem) {
	// Add to byFile
	if (!problems.byFile[problem.file]) {
		problems.byFile[problem.file] = [];
		problems.stats.files++;
	}
	problems.byFile[problem.file].push(problem);

	// Add to bySeverity
	if (problems.bySeverity[problem.severity]) {
		problems.bySeverity[problem.severity].push(problem);
		problems.stats[problem.severity + 's'] = (problems.stats[problem.severity + 's'] || 0) + 1;
	}

	// Add to byLanguage
	if (problems.byLanguage[problem.language]) {
		problems.byLanguage[problem.language].push(problem);
	}

	problems.stats.totalProblems++;
}

/**
 * Generate Markdown report for Claude/Copilot
 */
function generateMarkdownReport() {
	let md = '# VS Code Problems Report\n\n';
	md += `Generated: ${new Date().toLocaleString()}\n\n`;

	md += '## Summary\n\n';
	md += `- **Total Problems**: ${problems.stats.totalProblems}\n`;
	md += `- **Errors**: ${problems.stats.errors || 0}\n`;
	md += `- **Warnings**: ${problems.stats.warnings || 0}\n`;
	md += `- **Files Affected**: ${problems.stats.files}\n\n`;

	md += '## By Language\n\n';
	Object.entries(problems.byLanguage).forEach(([lang, probs]) => {
		if (probs.length > 0) {
			md += `### ${lang.charAt(0).toUpperCase() + lang.slice(1)} (${probs.length} problems)\n\n`;

			// Group by file
			const byFile = {};
			probs.forEach(p => {
				if (!byFile[p.file]) byFile[p.file] = [];
				byFile[p.file].push(p);
			});

			Object.entries(byFile).forEach(([file, fileProbs]) => {
				md += `#### \`${file}\` (${fileProbs.length} problems)\n\n`;
				fileProbs.forEach(p => {
					md += `- **Line ${p.line}:${p.column}** [${p.severity}] ${p.message}\n`;
				});
				md += '\n';
			});
		}
	});

	md += '\n## By Severity\n\n';
	Object.entries(problems.bySeverity).forEach(([severity, probs]) => {
		if (probs.length > 0) {
			md += `### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${probs.length})\n\n`;
			probs.slice(0, 20).forEach(p => {
				md += `- \`${p.file}\`:${p.line} - ${p.message}\n`;
			});
			if (probs.length > 20) {
				md += `\n_...and ${probs.length - 20} more_\n`;
			}
			md += '\n';
		}
	});

	md += '\n---\n\n';
	md += '**Next Steps for Agentic Healing:**\n\n';
	md += '1. Review high-priority errors first\n';
	md += '2. Group similar errors for batch fixing\n';
	md += '3. Use AST knowledge base to understand dependencies\n';
	md += '4. Apply automated fixes where possible\n';
	md += '5. Validate fixes with type checker\n';

	return md;
}

/**
 * Main collection function
 */
async function collect() {
	if (includeTsc) {
		collectTypeScriptProblems();
	}

	if (includeSvelteCheck) {
		collectSvelteProblems();
	}

	if (includeGo) {
		collectGoProblems();
	}

	if (includePython) {
		collectPythonProblems();
	}

	if (includeCpp) {
		collectCppProblems();
	}

	// Save JSON output
	const outputPath = path.join(__dirname, '..', outputFile);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(problems, null, 2));

	// Save Markdown report for AI assistants
	const mdPath = outputPath.replace('.json', '.md');
	fs.writeFileSync(mdPath, generateMarkdownReport());

	console.log(chalk.green.bold('\n✅ Problems collection complete!\n'));
	console.log(chalk.cyan('📊 Statistics:'));
	console.log(chalk.gray(`   Total problems: ${problems.stats.totalProblems}`));
	console.log(chalk.gray(`   Errors: ${problems.stats.errors || 0}`));
	console.log(chalk.gray(`   Warnings: ${problems.stats.warnings || 0}`));
	console.log(chalk.gray(`   Files affected: ${problems.stats.files}`));
	console.log(chalk.gray(`\n   JSON output: ${outputPath}`));
	console.log(chalk.gray(`   Markdown report: ${mdPath}\n`));
}

collect().catch(console.error);
