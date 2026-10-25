import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
	buildDomainTaxonomyOaklibReceiptV1,
	buildDomainTaxonomyOaklibSnapshotV1,
	verifyDomainTaxonomyOaklibReceiptV1,
} from './lib/domain-taxonomy-oaklib-snapshot-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 8000 });
let rows;
try {
	await client.connect();
	await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	await client.query("SET LOCAL statement_timeout='6000ms'");
	const result = await client.query(`
		SELECT group_id, group_label, parent_group_id, description, taxonomy_level
		FROM public.atlas_domain_ontology
		ORDER BY group_id
	`);
	rows = result.rows;
	await client.query('ROLLBACK');
} catch (error) {
	try { await client.query('ROLLBACK'); } catch {}
	throw new Error(`DOMAIN_TAXONOMY_READ_FAILED:${error.code ?? error.name}`);
} finally {
	await client.end().catch(() => {});
}

const snapshot = buildDomainTaxonomyOaklibSnapshotV1(rows);
const directoryName = snapshot.sourceTaxonomyRevision.replace(':', '-');
const relativeDirectory = path.join('.tmp', 'atlas', 'oaklib-domain-taxonomy', directoryName);
const outputDirectory = path.resolve(root, relativeDirectory);
const artifactPath = path.join(relativeDirectory, 'taxonomy.obo');
const receiptPath = path.join(relativeDirectory, 'receipt.json');
assert.ok(outputDirectory.startsWith(path.resolve(root, '.tmp', 'atlas', 'oaklib-domain-taxonomy') + path.sep));
mkdirSync(outputDirectory, { recursive: true });

const oboPath = path.join(outputDirectory, 'taxonomy.obo');
const receiptFilePath = path.join(outputDirectory, 'receipt.json');
const oboBytes = Buffer.from(snapshot.oboText, 'utf8');
if (existsSync(oboPath)) assert.deepEqual(readFileSync(oboPath), oboBytes);
else writeFileSync(oboPath, oboBytes, { flag: 'wx' });

if (!existsSync(receiptFilePath)) {
	const receipt = buildDomainTaxonomyOaklibReceiptV1(snapshot, artifactPath);
	writeFileSync(receiptFilePath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
}

const oboReadback = readFileSync(oboPath);
const receiptReadback = JSON.parse(readFileSync(receiptFilePath, 'utf8'));
assert.equal(`sha256:${createHash('sha256').update(oboReadback).digest('hex')}`, receiptReadback.ontologyRevision);
assert.equal(receiptReadback.sourceTaxonomyRevision, snapshot.sourceTaxonomyRevision);
assert.equal(receiptReadback.canonicalAuthority, false);
assert.equal(receiptReadback.databaseWritesPerformed, false);
assert.equal(verifyDomainTaxonomyOaklibReceiptV1(receiptReadback), true);

console.log(JSON.stringify({
	status: 'SHADOW_SNAPSHOT_READBACK_MATCH',
	rowCount: snapshot.rows.length,
	parentEdgeCount: snapshot.parentEdgeCount,
	sourceTaxonomyRevision: snapshot.sourceTaxonomyRevision,
	ontologyRevision: snapshot.ontologyRevision,
	artifactPath,
	receiptPath,
	canonicalAuthority: false,
	databaseWritesPerformed: false,
	readback: 'MATCH',
}, null, 2));
