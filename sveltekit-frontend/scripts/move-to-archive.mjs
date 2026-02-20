#!/usr/bin/env node
/**
 * Move corrupted/minified/commented unreachable files to deeds_labs archive.
 * Preserves directory structure.
 */
import { readFileSync, existsSync, mkdirSync, renameSync, readdirSync, rmdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function readList(name) {
	const p = resolve(PROJECT_ROOT, name);
	if (!existsSync(p)) return [];
	return readFileSync(p, 'utf8').trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

function moveFile(srcRel, destBase) {
	const src = resolve(PROJECT_ROOT, srcRel);
	if (!existsSync(src)) return false;

	const dest = resolve(PROJECT_ROOT, '..', destBase, srcRel);
	const destDir = dirname(dest);

	mkdirSync(destDir, { recursive: true });
	renameSync(src, dest);
	return true;
}

function cleanEmptyDirs(dir) {
	if (!existsSync(dir)) return;
	try {
		const stat = statSync(dir);
		if (!stat.isDirectory()) return;
	} catch { return; }

	const entries = readdirSync(dir);
	for (const e of entries) {
		cleanEmptyDirs(join(dir, e));
	}

	// Re-read after recursive cleanup
	try {
		if (readdirSync(dir).length === 0) {
			rmdirSync(dir);
		}
	} catch { /* ignore */ }
}

// Which categories to move (from CLI args or default)
const args = process.argv.slice(2);
const moveCorrupted = args.length === 0 || args.includes('--corrupted');
const moveMinified = args.length === 0 || args.includes('--minified');
const moveCommented = args.length === 0 || args.includes('--commented');
const dryRun = args.includes('--dry-run');

const corrupted = moveCorrupted ? readList('unreachable-corrupted.txt') : [];
const minified = moveMinified ? readList('unreachable-minified.txt') : [];
const commented = moveCommented ? readList('unreachable-commented.txt') : [];

console.log(`\nMoving unreachable files to deeds_labs/archived-unreachable/`);
console.log(`  Corrupted: ${corrupted.length}`);
console.log(`  Minified:  ${minified.length}`);
console.log(`  Commented: ${commented.length}`);
console.log(`  Dry run:   ${dryRun}`);
console.log();

let moved = 0;
let errors = 0;

function moveCategory(files, category) {
	for (const f of files) {
		try {
			if (dryRun) {
				console.log(`  [DRY] ${f} → deeds_labs/archived-unreachable/${category}/`);
				moved++;
			} else {
				if (moveFile(f, `deeds_labs/archived-unreachable/${category}`)) {
					moved++;
				}
			}
		} catch (e) {
			console.error(`  ERROR: ${f}: ${e.message}`);
			errors++;
		}
	}
}

moveCategory(corrupted, 'corrupted');
moveCategory(minified, 'minified');
moveCategory(commented, 'commented');

if (!dryRun) {
	console.log('Cleaning empty directories...');
	cleanEmptyDirs(resolve(PROJECT_ROOT, 'src'));
}

console.log(`\nDone. Moved: ${moved}, Errors: ${errors}`);
