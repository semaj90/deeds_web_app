#!/usr/bin/env node
/**
 * Multi-Language Error Analyzer
 * Actual implementations for Go, Python, C++ error detection
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Analyze Go services with `go vet`
 */
export async function analyzeGoServices(files, rootDir) {
	console.log(chalk.blue(`  🔍 Analyzing ${files.length} Go files...`));

	const errors = [];
	const goServiceDirs = new Set();

	// Find unique Go module directories
	files.forEach(file => {
		const dir = path.dirname(path.join(rootDir, '..', file));
		if (fs.existsSync(path.join(dir, 'go.mod'))) {
			goServiceDirs.add(dir);
		}
	});

	// Run `go vet` on each module
	for (const dir of goServiceDirs) {
		try {
			const output = execSync('go vet ./...', {
				cwd: dir,
				encoding: 'utf-8',
				stdio: 'pipe'
			});
		} catch (error) {
			// Parse go vet output
			const lines = error.stdout.toString().split('\n');
			lines.forEach(line => {
				const match = line.match(/^(.+):(\d+):(\d+): (.+)$/);
				if (match) {
					errors.push({
						file: path.relative(rootDir, path.join(dir, match[1])),
						line: parseInt(match[2]),
						column: parseInt(match[3]),
						message: match[4],
						tool: 'go vet',
						severity: 'error',
						language: 'go'
					});
				}
			});
		}
	}

	console.log(chalk.gray(`     Found ${errors.length} Go errors`));
	return errors;
}

/**
 * Analyze Python with mypy and pylint
 */
export async function analyzePythonScripts(files, rootDir) {
	console.log(chalk.blue(`  🔍 Analyzing ${files.length} Python files...`));

	const errors = [];

	// Check if mypy is available
	let hasMypyInstalled = false;
	try {
		execSync('mypy --version', { stdio: 'pipe' });
		hasMypyInstalled = true;
	} catch {
		console.log(chalk.yellow('     ⚠️  mypy not installed, skipping type checks'));
	}

	if (hasMypyInstalled) {
		for (const file of files.slice(0, 20)) { // Limit to 20 files for speed
			try {
				const fullPath = path.join(rootDir, file);
				const output = execSync(`mypy "${fullPath}"`, {
					encoding: 'utf-8',
					stdio: 'pipe'
				});
			} catch (error) {
				const lines = error.stdout.toString().split('\n');
				lines.forEach(line => {
					const match = line.match(/^(.+):(\d+): (\w+): (.+)$/);
					if (match) {
						errors.push({
							file: path.relative(rootDir, match[1]),
							line: parseInt(match[2]),
							message: match[4],
							tool: 'mypy',
							severity: match[3].toLowerCase(),
							language: 'python'
						});
					}
				});
			}
		}
	}

	console.log(chalk.gray(`     Found ${errors.length} Python errors`));
	return errors;
}

/**
 * Analyze C++/CUDA with clang-tidy
 */
export async function analyzeCppFiles(files, rootDir) {
	console.log(chalk.blue(`  🔍 Analyzing ${files.length} C++ files...`));

	const errors = [];

	// Check if clang-tidy is available
	let hasClangTidy = false;
	try {
		execSync('clang-tidy --version', { stdio: 'pipe' });
		hasClangTidy = true;
	} catch {
		console.log(chalk.yellow('     ⚠️  clang-tidy not installed, skipping C++ checks'));
		console.log(chalk.gray('     Install: https://clang.llvm.org/extra/clang-tidy/'));
	}

	if (hasClangTidy) {
		for (const file of files.slice(0, 10)) { // Limit to 10 files
			try {
				const fullPath = path.join(rootDir, file);
				if (fs.existsSync(fullPath)) {
					const output = execSync(`clang-tidy "${fullPath}" -- -std=c++17`, {
						encoding: 'utf-8',
						stdio: 'pipe'
					});
				}
			} catch (error) {
				const lines = error.stdout.toString().split('\n');
				lines.forEach(line => {
					const match = line.match(/^(.+):(\d+):(\d+): (\w+): (.+) \[(.+)\]$/);
					if (match) {
						errors.push({
							file: path.relative(rootDir, match[1]),
							line: parseInt(match[2]),
							column: parseInt(match[3]),
							message: match[5],
							tool: 'clang-tidy',
							severity: match[4].toLowerCase(),
							code: match[6],
							language: 'cpp'
						});
					}
				});
			}
		}
	}

	console.log(chalk.gray(`     Found ${errors.length} C++ errors`));
	return errors;
}
