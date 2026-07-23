import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { validateOkfGraphManifest, validateOkfLanguageSpec } from './okf-schema.js';

function findRepoRoot(start: string): string {
	let current = resolve(start);
	while (!existsSync(resolve(current, '.okf', 'manifest.yaml'))) {
		const parent = dirname(current);
		if (parent === current) throw new Error('Unable to locate repository .okf manifest');
		current = parent;
	}
	return current;
}

async function loadManifest() {
	return parse(await readFile(resolve(findRepoRoot(process.cwd()), '.okf', 'manifest.yaml'), 'utf8'));
}

describe('Parent Atlas OKF graph projection policy', () => {
	it('VALID_LANGUAGE_SPEC_PASSES and the repository manifest validates', async () => {
		const manifest = await loadManifest();
		expect(validateOkfGraphManifest(manifest).graph_projection.max_hops).toBe(2);
		expect(validateOkfLanguageSpec({ version: 1, language: 'typescript', name: 'TypeScript', extensions: ['.ts'] }).extensions).toEqual(['.ts']);
	});

	it('rejects unknown relationships with the offending value', async () => {
		const manifest = await loadManifest();
		manifest.graph_projection.pagerank_edges = ['teleports_to'];
		expect(() => validateOkfGraphManifest(manifest)).toThrow(/teleports_to/);
	});

	it('rejects invalid graph bounds and empty language extensions', async () => {
		const manifest = await loadManifest();
		manifest.graph_projection.max_hops = 4;
		expect(() => validateOkfGraphManifest(manifest)).toThrow(/4/);
		expect(() => validateOkfLanguageSpec({ version: 1, language: 'typescript', name: 'TypeScript', extensions: [] })).toThrow(/\[\]/);
	});

	it('rejects invalid confidence and inconsistent PageRank projection rules', async () => {
		const invalidConfidence = await loadManifest();
		invalidConfidence.graph_projection.minimum_confidence = 1.1;
		expect(() => validateOkfGraphManifest(invalidConfidence)).toThrow(/1.1/);

		const missingRelationship = await loadManifest();
		missingRelationship.relationships = missingRelationship.relationships.filter((value: string) => value !== 'imports');
		expect(() => validateOkfGraphManifest(missingRelationship)).toThrow(/imports/);

		const excludedPagerank = await loadManifest();
		excludedPagerank.graph_projection.excluded_edges.push('imports');
		expect(() => validateOkfGraphManifest(excludedPagerank)).toThrow(/imports/);
	});
});
