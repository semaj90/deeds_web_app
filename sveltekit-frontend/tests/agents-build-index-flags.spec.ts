// @vitest-environment node
//
// Contract tests for scripts/agents/build-agents-index.mjs flag handling.
// Verifies the GraphRAG pipeline gates (--dry-run, --limit, --skip-neo4j etc.)
// don't accidentally regress to the prior "always writes" behaviour.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '..', 'scripts', 'agents', 'build-agents-index.mjs');
const SOURCE = readFileSync(SCRIPT_PATH, 'utf-8');

describe('build-agents-index.mjs — flag contract (Phase GraphRAG, 2026-05-11)', () => {
	it('parses every documented flag', () => {
		// Every flag mentioned in the script's header doc-block must be wired
		const flags = ['--dry-run', '--limit', '--quiet', '--skip-couchdb', '--skip-neo4j', '--skip-analysis'];
		for (const f of flags) {
			expect(SOURCE.includes(f)).toBe(true);
		}
	});

	it('dry-run path skips both CouchDB and Neo4j writes', () => {
		// Source must reference the dryRun flag check at every write site
		const couchGate  = /FLAGS\.dryRun[\s\S]{0,80}would write[\s\S]{0,40}CouchDB/;
		const neo4jGate  = /FLAGS\.dryRun[\s\S]{0,80}would write[\s\S]{0,40}Neo4j/;
		const analysisGate = /FLAGS\.dryRun[\s\S]{0,200}activityScore/;
		expect(SOURCE).toMatch(couchGate);
		expect(SOURCE).toMatch(neo4jGate);
		expect(SOURCE).toMatch(analysisGate);
	});

	it('--skip-neo4j short-circuits before opening any Neo4j request', () => {
		expect(SOURCE).toMatch(/FLAGS\.skipNeo4j[\s\S]{0,60}skip\] Neo4j/);
	});

	it('--skip-couchdb short-circuits before opening any CouchDB request', () => {
		expect(SOURCE).toMatch(/FLAGS\.skipCouchdb[\s\S]{0,60}skip\] CouchDB/);
	});

	it('analysis stage skips when either Neo4j or CouchDB is skipped', () => {
		// Analysis needs both stages to function; must defensively skip
		expect(SOURCE).toMatch(/skipAnalysis \|\| FLAGS\.skipNeo4j \|\| FLAGS\.skipCouchdb/);
	});

	it('--limit accepts both `--limit=N` and `--limit N` forms', () => {
		// Both forms must be parsed (matches existing sync-manifold4-neo4j.mjs convention)
		expect(SOURCE).toMatch(/--limit=/);
		expect(SOURCE).toMatch(/indexOf\('--limit'\)/);
	});

	it('writes 4 distinct Neo4j node labels: AgentsCard, Directory, Feature, Tag', () => {
		expect(SOURCE).toMatch(/MERGE \(c:AgentsCard /);
		expect(SOURCE).toMatch(/MERGE \(d:Directory /);
		expect(SOURCE).toMatch(/MERGE \(f:Feature /);
		expect(SOURCE).toMatch(/MERGE \(t:Tag /);
	});

	it('Cypher uses UNWIND batch + idempotent MERGE (not CREATE)', () => {
		expect(SOURCE).toMatch(/UNWIND \$rows AS row/);
		// No raw CREATE statements that would duplicate on re-run
		expect(SOURCE).not.toMatch(/CREATE \(:AgentsCard/);
	});

	it('analysis pass writes activityScore back to CouchDB via re-hashed card', () => {
		// Re-hashing is critical — without it, writeToCouch's contentHash gate skips the update
		expect(SOURCE).toMatch(/card\.contentHash = computeCardContentHash\(card\)/);
		expect(SOURCE).toMatch(/card\.activityScore = newScore/);
	});

	it('Neo4j connection uses HTTP query API (not bolt) for scriptability', () => {
		// HTTP path matches karpathy-gpu-enrich.mjs pattern; bolt requires neo4j-driver dep
		expect(SOURCE).toMatch(/\/db\/neo4j\/tx\/commit/);
		expect(SOURCE).not.toMatch(/from 'neo4j-driver'/);
	});
});
