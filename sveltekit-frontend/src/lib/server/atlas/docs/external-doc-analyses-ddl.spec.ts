// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ExternalDocAnalysisV1Schema, ExternalDocAnalysisTypeSchema } from './external-doc-intelligence-contracts-v1.js';

const sql = readFileSync(resolve(__dirname, '../../../../../drizzle/manual/20260923b_external_doc_analyses_v1.sql'), 'utf8');
const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('atlas_external_doc_analyses draft DDL matches ExternalDocAnalysisV1 (static, no database)', () => {
	it('is marked unapplied and additive only', () => {
		expect(sql.split('\n')[0]).toContain('DRAFT_UNAPPLIED');
		expect(sql).not.toMatch(/\bDROP TABLE\b|\bALTER TABLE\b/i);
	});

	it('has a column for every contract field (except the schema literal)', () => {
		for (const key of Object.keys(ExternalDocAnalysisV1Schema.shape).filter((k) => k !== 'schema')) {
			expect(sql, key).toMatch(new RegExp(String.raw`\b${camelToSnake(key)}\b`));
		}
	});

	it('enumerates exactly the contract analysis types', () => {
		for (const t of ExternalDocAnalysisTypeSchema.options) expect(sql).toContain(`'${t}'`);
	});

	it('pins non-canonical authority, chunk-evidence FK, refinements and append-only', () => {
		expect(sql).toMatch(/canonical_authority = false/);
		expect(sql).toMatch(/REFERENCES atlas_external_doc_chunks \(evidence_revision\)/);
		expect(sql).toMatch(/aeda_summary_requires_text/);
		expect(sql).toMatch(/aeda_model_requires_revisions/);
		expect(sql).toMatch(/BEFORE UPDATE OR DELETE/);
	});
});
