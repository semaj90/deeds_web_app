#!/usr/bin/env node
/**
 * Drizzle schema drift auditor — automates DRIZZLE_SCHEMA_DRIFT_AUDIT.md
 *
 * Compares `src/lib/server/db/schema-postgres.ts` against the reference doc
 * `data/knowledge/drizzle-schema-reference.md` (if present) or against a
 * prior snapshot. Emits a compact report showing tables/enums added or
 * dropped since the last known state.
 *
 * Usage:
 *   node scripts/audit-schema-drift.mjs              # print drift report
 *   node scripts/audit-schema-drift.mjs --save       # update snapshot file
 *   node scripts/audit-schema-drift.mjs --exit-1     # exit 1 if drift found
 *   node scripts/audit-schema-drift.mjs --json       # machine-readable output
 *
 * Snapshot is kept at scripts/audit-schema-drift.snapshot.json so CI can
 * diff weekly without parsing the markdown reference.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../src/lib/server/db/schema-postgres.ts');
const DOC_PATH = resolve(HERE, '../../data/knowledge/drizzle-schema-reference.md');
const SNAPSHOT_PATH = resolve(HERE, 'audit-schema-drift.snapshot.json');

const args = new Set(process.argv.slice(2));
const SAVE = args.has('--save');
const JSON_OUT = args.has('--json');
const EXIT_1 = args.has('--exit-1');

// ── Extract real state from schema-postgres.ts ─────────────────────────────

function extractSchemaState(src) {
	const tables = new Set();
	const enums = new Set();
	const tableRe = /^export const ([a-zA-Z_]+) = pgTable\(/gm;
	const enumRe = /^export const ([a-zA-Z_]+)Enum = pgEnum\(/gm;
	let m;
	while ((m = tableRe.exec(src))) tables.add(m[1]);
	while ((m = enumRe.exec(src))) enums.add(m[1] + 'Enum');
	return {
		tables: [...tables].sort(),
		enums: [...enums].sort()
	};
}

// ── Extract claimed state from reference doc ──────────────────────────────

function extractDocState(src) {
	// Doc uses markdown tables with backtick-quoted names: `| \`tableName\` |`
	const names = new Set();
	const re = /\| `([a-zA-Z_]+)`/g;
	let m;
	while ((m = re.exec(src))) names.add(m[1]);
	// Filter obvious non-names (columns, types, enum values)
	const looksLikeTableOrEnum = (n) =>
		/^[a-z]/.test(n) && n.length >= 3 && !/^(id|uuid|text|int|jsonb|bool|varchar|timestamp)$/.test(n);
	return [...names].filter(looksLikeTableOrEnum).sort();
}

// ── Main ───────────────────────────────────────────────────────────────────

if (!existsSync(SCHEMA_PATH)) {
	console.error(`Schema file not found: ${SCHEMA_PATH}`);
	process.exit(2);
}

const schemaSrc = readFileSync(SCHEMA_PATH, 'utf8');
const real = extractSchemaState(schemaSrc);

let baseline = { tables: [], enums: [], source: null };

if (existsSync(SNAPSHOT_PATH)) {
	baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
	baseline.source = 'snapshot';
} else if (existsSync(DOC_PATH)) {
	const docSrc = readFileSync(DOC_PATH, 'utf8');
	const docNames = extractDocState(docSrc);
	baseline = {
		tables: docNames,
		enums: [],
		source: 'doc'
	};
}

function diff(realArr, baseArr) {
	const realSet = new Set(realArr);
	const baseSet = new Set(baseArr);
	return {
		added: realArr.filter((n) => !baseSet.has(n)),
		dropped: baseArr.filter((n) => !realSet.has(n))
	};
}

const tableDiff = diff(real.tables, baseline.tables);
const enumDiff = diff(real.enums, baseline.enums);
const hasDrift =
	tableDiff.added.length + tableDiff.dropped.length + enumDiff.added.length + enumDiff.dropped.length >
	0;

if (JSON_OUT) {
	console.log(
		JSON.stringify(
			{
				baseline: baseline.source ?? 'none',
				real: { tableCount: real.tables.length, enumCount: real.enums.length },
				diff: {
					tables: tableDiff,
					enums: enumDiff
				},
				hasDrift
			},
			null,
			2
		)
	);
} else {
	console.log(`Schema drift audit — ${new Date().toISOString()}`);
	console.log(`  Baseline: ${baseline.source ?? 'none (fresh)'}`);
	console.log(
		`  Current:  ${real.tables.length} tables, ${real.enums.length} enums in schema-postgres.ts`
	);
	console.log('');

	if (!hasDrift) {
		console.log('✅ No drift detected');
	} else {
		if (tableDiff.added.length > 0) {
			console.log(`📈 Tables added (${tableDiff.added.length}):`);
			for (const t of tableDiff.added) console.log(`   + ${t}`);
		}
		if (tableDiff.dropped.length > 0) {
			console.log(`📉 Tables dropped (${tableDiff.dropped.length}):`);
			for (const t of tableDiff.dropped) console.log(`   - ${t}`);
		}
		if (enumDiff.added.length > 0) {
			console.log(`📈 Enums added (${enumDiff.added.length}):`);
			for (const e of enumDiff.added) console.log(`   + ${e}`);
		}
		if (enumDiff.dropped.length > 0) {
			console.log(`📉 Enums dropped (${enumDiff.dropped.length}):`);
			for (const e of enumDiff.dropped) console.log(`   - ${e}`);
		}
	}
}

if (SAVE) {
	writeFileSync(
		SNAPSHOT_PATH,
		JSON.stringify(
			{
				tables: real.tables,
				enums: real.enums,
				capturedAt: new Date().toISOString()
			},
			null,
			2
		)
	);
	console.log('');
	console.log(`💾 Snapshot saved to ${SNAPSHOT_PATH}`);
}

if (EXIT_1 && hasDrift) process.exit(1);
