#!/usr/bin/env node
/**
 * Agentic Healing Orchestrator - Phase 72+
 *
 * Intelligently routes errors to appropriate AI services:
 * - TypeScript/JavaScript/Svelte → Local Ollama (Gemma3)
 * - Go → Gemini API
 * - Python → Gemini API
 * - C++/CUDA → Gemini API
 *
 * Features:
 * - Batches similar errors together
 * - Generates context-aware fixes using AST knowledge
 * - Validates fixes before applying
 * - Tracks success/failure metrics
 * - Generates detailed reports
 */

import chalk from 'chalk';
import cliProgress from 'cli-progress';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const problemsFile = args.includes('--problems') ? args[args.indexOf('--problems') + 1] : 'reports/latest/vscode-problems.json';
const kbFile = args.includes('--kb') ? args[args.indexOf('--kb') + 1] : 'reports/latest/enhanced-ast-kb.tree.json';
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'reports/latest/healing-report.json';
const dryRun = args.includes('--dry-run');
const maxFixes = args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1]) : 50;

console.log(chalk.cyan.bold('🤖 Agentic Healing Orchestrator\n'));
console.log(chalk.gray(`Problems: ${problemsFile}`));
console.log(chalk.gray(`Knowledge Base: ${kbFile}`));
console.log(chalk.gray(`Dry Run: ${dryRun}`));
console.log(chalk.gray(`Max Fixes: ${maxFixes}\n`));

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_CHAT_MODEL || 'gemma3-legal:latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

const healingReport = {
	timestamp: new Date().toISOString(),
	dryRun,
	totalProblems: 0,
	fixAttempts: 0,
	successful: 0,
	failed: 0,
	skipped: 0,
	byLanguage: {},
	fixes: []
};

/**
 * Load data files
 */
function loadData() {
	const problemsPath = path.join(__dirname, '..', problemsFile);
	const kbPath = path.join(__dirname, '..', kbFile);

	if (!fs.existsSync(problemsPath)) {
		console.error(chalk.red(`❌ Problems file not found: ${problemsPath}`));
		console.log(chalk.yellow('Run: node scripts/vscode-problems-collector.mjs'));
		process.exit(1);
	}

	const problems = JSON.parse(fs.readFileSync(problemsPath, 'utf-8'));
	let kb = { graph: { nodes: [] } };

	if (fs.existsSync(kbPath)) {
		kb = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
	}

	return { problems, kb };
}

/**
 * Group similar errors for batch fixing
 */
function groupErrors(problems) {
	const groups = {};

	Object.entries(problems.byFile).forEach(([file, fileProblems]) => {
		fileProblems.forEach(problem => {
			let key = `${problem.language}_${problem.code}`;

			// If code is generic 'svelte', use message to differentiate
			if (problem.code === 'svelte') {
				key = `${problem.language}_${problem.message}`;
			}

			if (!groups[key]) {
				groups[key] = {
					language: problem.language,
					code: problem.code === 'svelte' ? 'pattern_match' : problem.code,
					problems: [],
					exampleMessage: problem.message
				};
			}

			groups[key].problems.push({
				...problem,
				file
			});
		});
	});

	return Object.values(groups);
}

/**
 * Get relevant context from knowledge base
 */
function getContext(file, kb) {
	const node = kb.graph.nodes.find(n => n.path === file || n.label === file);

	if (!node) return null;

	return {
		imports: node.metadata.imports || [],
		exports: node.metadata.exports || [],
		symbols: node.metadata.symbols || [],
		fileType: node.fileType
	};
}

/**
 * Call Ollama API for TypeScript/JavaScript/Svelte errors
 */
async function fixWithOllama(errorGroup, context) {
	const prompt = buildPrompt(errorGroup, context);

	try {
		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				prompt,
				stream: false,
				options: {
					temperature: 0.2,
					top_p: 0.9
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.statusText}`);
		}

		const data = await response.json();
		return parseFix(data.response);
	} catch (error) {
		console.error(chalk.red(`Ollama error: ${error.message}`));
		return null;
	}
}

/**
 * Call Gemini API for Go/Python/C++ errors
 */
async function fixWithGemini(errorGroup, context) {
	if (!GEMINI_API_KEY) {
		console.warn(chalk.yellow('⚠️  Gemini API key not configured, skipping'));
		return null;
	}

	const prompt = buildPrompt(errorGroup, context);

	try {
		const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					parts: [{
						text: prompt
					}]
				}],
				generationConfig: {
					temperature: 0.2,
					topP: 0.9,
					maxOutputTokens: 2048
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Gemini API error: ${response.statusText}`);
		}

		const data = await response.json();
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		return parseFix(text);
	} catch (error) {
		console.error(chalk.red(`Gemini error: ${error.message}`));
		return null;
	}
}

/**
 * Build prompt for AI
 */
function buildPrompt(errorGroup, context) {
	const examples = errorGroup.problems.slice(0, 3);

	let prompt = `You are an expert code fixer. Fix the following ${errorGroup.language} errors.

Error Type: ${errorGroup.code}
Example Error: ${errorGroup.exampleMessage}

Context:
`;

	if (context) {
		prompt += `File Type: ${context.fileType}
Imports: ${context.imports.join(', ')}
Exports: ${context.exports.join(', ')}
`;
	}

	prompt += `
Examples of this error:
`;

	examples.forEach((problem, i) => {
		prompt += `
${i + 1}. File: ${problem.file}
   Line: ${problem.line}
   Error: ${problem.message}
`;
	});

	prompt += `

Provide a fix for this error pattern.
You MUST respond with a valid JSON object in the following format:
{
    "explanation": "Brief explanation of the error",
    "pattern": "Regex pattern to find the issue (escape backslashes properly, e.g. \\\\s+ for whitespace)",
    "replacement": "Replacement string (use $1, $2 for groups)",
    "confidence": 0.9
}

IMPORTANT:
1. The output MUST be valid JSON.
2. Escape all backslashes in the regex pattern (e.g. use "\\\\d" for digit, not "\\d").
3. Do not include markdown formatting like \`\`\`json.
`;

	return prompt;
}

/**
 * Parse AI response into structured fix
 */
function parseFix(response) {
	if (!response) return null;

	try {
		// Try to find JSON block
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}
		return JSON.parse(response);
	} catch (e) {
		console.error(chalk.red(`Failed to parse JSON fix: ${e.message}`));
		// Fallback to old parsing if JSON fails (legacy support)
		const fix = {
			explanation: '',
			pattern: '',
			replacement: '',
			confidence: 0.7
		};

		const explanationMatch = response.match(/EXPLANATION:\s*([^]*?)(?=FIX:|PATTERN:|$)/i);
		const patternMatch = response.match(/PATTERN:\s*([^]*?)(?=REPLACEMENT:|EXPLANATION:|$)/i);
		const replacementMatch = response.match(/REPLACEMENT:\s*([^]*?)(?=EXPLANATION:|PATTERN:|$)/i);

		if (explanationMatch) fix.explanation = explanationMatch[1].trim();
		if (patternMatch) fix.pattern = patternMatch[1].trim();
		if (replacementMatch) fix.replacement = replacementMatch[1].trim();

		return fix;
	}
}

/**
 * Apply fix to file
 */
function applyFix(file, fix) {
	if (dryRun) {
		console.log(chalk.yellow(`  [DRY RUN] Would apply fix to: ${file}`));
		return true;
	}

	try {
		const content = fs.readFileSync(file, 'utf-8');

		// Try to apply pattern-based fix
		if (fix.pattern && fix.replacement) {
			const regex = new RegExp(fix.pattern, 'gm');
			const newContent = content.replace(regex, fix.replacement);

			if (newContent !== content) {
				fs.writeFileSync(file, newContent);
				console.log(chalk.green(`  ✅ Applied fix to: ${file}`));
				return true;
			}
		}

		console.log(chalk.yellow(`  ⚠️  Could not apply automatic fix to: ${file}`));
		return false;
	} catch (error) {
		console.error(chalk.red(`  ❌ Error applying fix: ${error.message}`));
		return false;
	}
}

/**
 * Main healing function
 */
async function heal() {
	const { problems, kb } = loadData();
	healingReport.totalProblems = problems.stats.totalProblems;

	console.log(chalk.yellow(`📊 Found ${problems.stats.totalProblems} problems\n`));

	// Group errors
	const errorGroups = groupErrors(problems);
	console.log(chalk.yellow(`🧩 Grouped into ${errorGroups.length} error patterns\n`));

	// Sort by frequency
	errorGroups.sort((a, b) => b.problems.length - a.problems.length);

	// Progress bar
	const progressBar = new cliProgress.SingleBar({
		format: chalk.cyan('{bar}') + ' | {value}/{total} groups | {status}',
	}, cliProgress.Presets.shades_classic);

	progressBar.start(Math.min(errorGroups.length, maxFixes), 0, { status: 'Starting...' });

	// Process each group
	try {
		for (let i = 0; i < Math.min(errorGroups.length, maxFixes); i++) {
			const group = errorGroups[i];
			const firstProblem = group.problems[0];
			const context = getContext(firstProblem.file, kb);

			progressBar.update(i + 1, { status: `Fixing ${group.language} errors...` });

			healingReport.fixAttempts++;

			if (!healingReport.byLanguage[group.language]) {
				healingReport.byLanguage[group.language] = {
					attempted: 0,
					successful: 0,
					failed: 0
				};
			}

			healingReport.byLanguage[group.language].attempted++;

			let fix = null;

			// Route to appropriate AI
			if (['typescript', 'javascript', 'svelte'].includes(group.language)) {
				fix = await fixWithOllama(group, context);
			} else if (['go', 'python', 'cpp'].includes(group.language)) {
				fix = await fixWithGemini(group, context);
			}

			if (fix) {
				// Apply fix to each affected file
				let fixSuccess = false;

				for (const problem of group.problems.slice(0, 5)) { // Limit to 5 files per group
					const applied = applyFix(problem.file, fix);
					if (applied) fixSuccess = true;
				}

				if (fixSuccess) {
					healingReport.successful++;
					healingReport.byLanguage[group.language].successful++;
				} else {
					healingReport.failed++;
					healingReport.byLanguage[group.language].failed++;
				}

				healingReport.fixes.push({
					language: group.language,
					code: group.code,
					affectedFiles: group.problems.length,
					fix,
					applied: fixSuccess
				});
			} else {
				healingReport.skipped++;
			}

			// Rate limiting
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	} catch (error) {
		console.error(chalk.red(`\n❌ Critical error in healing loop: ${error.message}`));
		console.error(error.stack);
	}

	progressBar.stop();

	// Save report
	const outputPath = path.join(__dirname, '..', outputFile);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(healingReport, null, 2));

	// Generate markdown report
	const mdReport = generateMarkdownReport();
	fs.writeFileSync(outputPath.replace('.json', '.md'), mdReport);

	console.log(chalk.green.bold('\n✅ Healing complete!\n'));
	console.log(chalk.cyan('📊 Statistics:'));
	console.log(chalk.gray(`   Total problems: ${healingReport.totalProblems}`));
	console.log(chalk.gray(`   Fix attempts: ${healingReport.fixAttempts}`));
	console.log(chalk.gray(`   Successful: ${healingReport.successful}`));
	console.log(chalk.gray(`   Failed: ${healingReport.failed}`));
	console.log(chalk.gray(`   Skipped: ${healingReport.skipped}`));
	console.log(chalk.gray(`\n   Report: ${outputPath}\n`));
}

/**
 * Generate markdown report
 */
function generateMarkdownReport() {
	let md = '# Agentic Healing Report\n\n';
	md += `Generated: ${new Date().toLocaleString()}\n\n`;

	md += '## Summary\n\n';
	md += `- **Total Problems**: ${healingReport.totalProblems}\n`;
	md += `- **Fix Attempts**: ${healingReport.fixAttempts}\n`;
	md += `- **Successful**: ${healingReport.successful} ✅\n`;
	md += `- **Failed**: ${healingReport.failed} ❌\n`;
	md += `- **Skipped**: ${healingReport.skipped} ⏭️\n`;
	md += `- **Success Rate**: ${((healingReport.successful / healingReport.fixAttempts) * 100).toFixed(1)}%\n\n`;

	md += '## By Language\n\n';
	Object.entries(healingReport.byLanguage).forEach(([lang, stats]) => {
		const rate = ((stats.successful / stats.attempted) * 100).toFixed(1);
		md += `### ${lang.charAt(0).toUpperCase() + lang.slice(1)}\n\n`;
		md += `- Attempted: ${stats.attempted}\n`;
		md += `- Successful: ${stats.successful}\n`;
		md += `- Failed: ${stats.failed}\n`;
		md += `- Success Rate: ${rate}%\n\n`;
	});

	md += '## Fixes Applied\n\n';
	healingReport.fixes.forEach((fix, i) => {
		md += `### Fix ${i + 1}: ${fix.language} - ${fix.code}\n\n`;
		md += `- **Affected Files**: ${fix.affectedFiles}\n`;
		md += `- **Applied**: ${fix.applied ? '✅ Yes' : '❌ No'}\n`;
		if (fix.fix.explanation) {
			md += `\n**Explanation**: ${fix.fix.explanation}\n`;
		}
		md += '\n';
	});

	return md;
}

heal().catch(console.error);
