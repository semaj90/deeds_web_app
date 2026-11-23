import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd(), '..');

describe('GAN Validation Gate & PG18 / Ontology Recommender Integration', () => {
	it('runs gan-validation-hook.mjs cleanly and enforces CREATED != WIRED != PROVEN != DONE', () => {
		const raw = execFileSync('node', ['scripts/atlas/gan-validation-hook.mjs'], {
			cwd: REPO_ROOT,
			encoding: 'utf8'
		});
		const parsed = JSON.parse(raw) as {
			hook: string;
			status: string;
			census: { total: number; done: number; partial: number; open: number };
			policy: string;
		};
		expect(parsed.hook).toBe('gan-validation-gate');
		expect(parsed.status).toBe('PASS');
		expect(parsed.policy).toBe('CREATED != WIRED != PROVEN != DONE');
		expect(parsed.census.total).toBe(
			parsed.census.done + parsed.census.partial + parsed.census.open
		);
	});

	it('verifies PG18 pgvector audit and NetworkX K-Means/PageRank proposal stay non-canonical', () => {
		const pgAudit = JSON.parse(
			readFileSync(resolve(REPO_ROOT, 'docs/reports/pg18-native-capability-audit-v1.json'), 'utf8')
		) as {
			postgres: { connected: boolean; extensions: Array<{ extname: string }> };
			nativeArtifacts: Array<{ id: string; exists: boolean }>;
		};
		expect(pgAudit.postgres.connected).toBe(true);
		expect(pgAudit.postgres.extensions.some((e) => e.extname === 'vector')).toBe(true);
		expect(pgAudit.nativeArtifacts.some((a) => a.id === 'nes_lut_avx2_src' && a.exists)).toBe(
			true
		);
		expect(pgAudit.nativeArtifacts.some((a) => a.id === 'simdjson_bridge' && a.exists)).toBe(true);
		expect(pgAudit.nativeArtifacts.some((a) => a.id === 'libtorch_graph' && a.exists)).toBe(true);

		const recReport = JSON.parse(
			readFileSync(resolve(REPO_ROOT, 'docs/reports/scene-ontology-kmeans-pagerank-v1.json'), 'utf8')
		) as {
			authorityLabel: string;
			nonCanonical: boolean;
			conceptCount: number;
			topRecommendations: Array<{ conceptId: string; score: number }>;
		};
		expect(recReport.authorityLabel).toBe('RETRIEVAL_PROPOSAL');
		expect(recReport.nonCanonical).toBe(true);
		expect(recReport.conceptCount).toBe(506);
		expect(recReport.topRecommendations.length).toBeGreaterThan(0);
	});
});
