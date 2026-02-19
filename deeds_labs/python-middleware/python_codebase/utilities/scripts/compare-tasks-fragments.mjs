#!/usr/bin/env node
import fs from 'fs/promises';

async function main() {
  const [, , leftPath, rightPath] = process.argv;
  if (!leftPath || !rightPath) {
	console.error('Usage: node compare-tasks-fragments.mjs <leftFile> <rightFile>');
	process.exit(2);
  }

  try {
	const [leftContent, rightContent] = await Promise.all([
	  fs.readFile(leftPath, 'utf8'),
	  fs.readFile(rightPath, 'utf8')
	]);

	const leftLines = leftContent.split(/\r?\n/);
	const rightLines = rightContent.split(/\r?\n/);

	const diffs = computeLineDiff(leftLines, rightLines);
	if (diffs.length === 0) {
	  console.log('No differences found.');
	  process.exit(0);
	}

	console.log('Differences:');
	for (const line of diffs) {
	  console.log(line);
	}
	process.exit(0);
  } catch (err) {
	console.error('Error:', err.message);
	process.exit(1);
  }
}

function computeLineDiff(a, b) {
  const out = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
	const la = a[i];
	const lb = b[i];
	if (la === lb) continue;
	if (la !== undefined) out.push(`- ${i + 1}: ${la}`);
	if (lb !== undefined) out.push(`+ ${i + 1}: ${lb}`);
  }
  return out;
}

if (process.argv[1] && process.argv[1].includes('compare-tasks-fragments')) {
  main();
}
