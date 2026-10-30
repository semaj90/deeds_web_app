import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(repositoryRoot, 'sveltekit-frontend/drizzle/manual/20261029_duplicate_index_consolidation_v2.sql');
const rollbackPath = path.join(repositoryRoot, 'sveltekit-frontend/drizzle/manual/20261029_duplicate_index_consolidation_v2_rollback.sql');
const artifactDirectory = path.resolve(process.env.REC12_TEST_DIR ?? path.join(repositoryRoot, '.tmp/atlas/rec12-v2-disposable-rehearsal'));
const dataDirectory = path.join(artifactDirectory, 'pgdata');
const receiptPath = path.join(artifactDirectory, 'receipt.json');
const postgresBin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const port = Number(process.env.REC12_TEST_PG_PORT ?? 55439);

function run(executable, args, options = {}) {
	const result = spawnSync(executable, args, {
		cwd: repositoryRoot,
		encoding: 'utf8',
		windowsHide: true,
		stdio: options.stdio ?? 'pipe',
		...options
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${executable} exited ${result.status}:\n${result.stdout}\n${result.stderr}`);
	}
	return (result.stdout ?? '').trim();
}

function sqlStatements(filePath, expression) {
	const source = fs.readFileSync(filePath, 'utf8');
	return source.split(/\r?\n/).filter((line) => expression.test(line));
}

function splitExpressions(source) {
	const expressions = [];
	let depth = 0;
	let start = 0;
	for (let offset = 0; offset < source.length; offset += 1) {
		if (source[offset] === '(') depth += 1;
		if (source[offset] === ')') depth -= 1;
		if (source[offset] === ',' && depth === 0) {
			expressions.push(source.slice(start, offset).trim());
			start = offset + 1;
		}
	}
	expressions.push(source.slice(start).trim());
	return expressions;
}

function parseIndexStatement(statement) {
	const match = statement.match(/^CREATE INDEX CONCURRENTLY IF NOT EXISTS (\w+) ON public\.(\w+) USING \w+ \((.+)\);$/i);
	assert.ok(match, `Unsupported rollback index statement: ${statement}`);
	const [, name, table, rawColumns] = match;
	const indexedColumns = rawColumns.replace(/\)\s+WHERE\s+\(.+$/i, ')');
	const columns = splitExpressions(indexedColumns).map((expression) => {
		const normalized = expression
			.replace(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?$/i, '')
			.replace(/\s+[a-z_][a-z_0-9]*_ops$/i, '')
			.replace(/::[a-z_][a-z_0-9]*(\[\])?/gi, '')
			.replace(/[()]/g, '')
			.trim();
		assert.match(normalized, /^[a-z_][a-z_0-9]*$/i, `Unsupported rollback index column: ${expression}`);
		return normalized;
	});
	return { name, table, columns };
}

assert.ok(!fs.existsSync(receiptPath), `Refusing to overwrite an existing receipt: ${receiptPath}`);
assert.ok(!fs.existsSync(path.join(artifactDirectory, 'fixture.sql')), 'Refusing to overwrite an existing fixture');
const dropStatements = sqlStatements(migrationPath, /^DROP INDEX CONCURRENTLY IF EXISTS public\./);
const createStatements = sqlStatements(rollbackPath, /^CREATE INDEX CONCURRENTLY IF NOT EXISTS /);
assert.equal(dropStatements.length, 32, 'Expected exactly 32 active V2 index drops');
assert.equal(createStatements.length, dropStatements.length, 'Rollback must recreate every active drop');
const migrationLines = fs.readFileSync(migrationPath, 'utf8').split(/\r?\n/);
const dropKeeperPairs = migrationLines
	.filter((line) => /^-- \[G[012]_[^\]]+\] \w+: drop \w+ \| keeps \w+/.test(line))
	.map((line) => {
		const match = line.match(/drop (\w+) \| keeps (\w+)/);
		return { drop: match[1], keeper: match[2] };
	});
assert.equal(dropKeeperPairs.length, dropStatements.length, 'Every active drop must identify its keeper');
const candidateIndexes = createStatements.map(parseIndexStatement);
const indexNames = new Set(candidateIndexes.map(({ name }) => name));
const rollbackByName = new Map(createStatements.map((statement) => [statement.match(/^CREATE INDEX CONCURRENTLY IF NOT EXISTS (\w+)/)[1], statement]));
const keeperByName = new Map();
for (const { drop, keeper } of dropKeeperPairs) {
	const source = rollbackByName.get(drop);
	assert.ok(source, `No rollback definition for ${drop}`);
	keeperByName.set(keeper, source.replace(`IF NOT EXISTS ${drop} ON`, `IF NOT EXISTS ${keeper} ON`));
}
const keeperStatements = [...keeperByName.values()];
const keeperNames = new Set(keeperStatements.map((statement) => statement.match(/^CREATE INDEX CONCURRENTLY IF NOT EXISTS (\w+)/)[1]));
const allIndexes = [...candidateIndexes, ...keeperStatements.map(parseIndexStatement)];
for (const statement of dropStatements) {
	const name = statement.match(/public\.(\w+);$/)?.[1];
	assert.ok(indexNames.has(name), `No rollback definition for ${name}`);
}

fs.mkdirSync(artifactDirectory, { recursive: true });
if (!fs.existsSync(path.join(dataDirectory, 'PG_VERSION'))) {
	run(path.join(postgresBin, 'initdb.exe'), ['-D', dataDirectory, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-locale', '-E', 'UTF8']);
}
let serverStarted = false;
try {
	run(path.join(postgresBin, 'pg_ctl.exe'), ['-D', dataDirectory, '-l', path.join(artifactDirectory, 'server.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });
	serverStarted = true;
	const psql = (sql) => run(path.join(postgresBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql]);
	assert.equal(psql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','i')"), '0', 'Refusing to reuse a test cluster containing user tables or indexes');
	const tableColumns = new Map();
	for (const index of allIndexes) {
		const columns = tableColumns.get(index.table) ?? new Set();
		for (const column of index.columns) columns.add(column);
		tableColumns.set(index.table, columns);
	}
	const fixtureSql = [...tableColumns].map(([table, columns]) => {
		const declarations = [...columns].map((column) => {
			const type = table === 'atlas_packets' && column === 'tags' ? 'text[]' : 'jsonb';
			return `\"${column}\" ${type}`;
		}).join(', ');
		const seedTags = table === 'atlas_packets'
			? " INSERT INTO public.\"atlas_packets\" (tags) SELECT CASE WHEN value=1 THEN ARRAY['x']::text[] ELSE ARRAY['y']::text[] END FROM generate_series(1,50000) AS value; ANALYZE public.\"atlas_packets\";"
			: '';
		return `CREATE TABLE public.\"${table}\" (${declarations}); INSERT INTO public.\"${table}\" DEFAULT VALUES;${seedTags}`;
	}).join('\n');
	const fixtureFile = path.join(artifactDirectory, 'fixture.sql');
	fs.writeFileSync(fixtureFile, fixtureSql, 'utf8');
	run(path.join(postgresBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', fixtureFile]);
	const rollbackFile = path.join(artifactDirectory, 'rollback-indexes.sql');
	fs.writeFileSync(rollbackFile, createStatements.join('\n'), 'utf8');
	const fixtureIndexesFile = path.join(artifactDirectory, 'fixture-indexes.sql');
	fs.writeFileSync(fixtureIndexesFile, [...createStatements, ...keeperStatements].join('\n'), 'utf8');
	run(path.join(postgresBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', fixtureIndexesFile]);
	const tagsQuery = "EXPLAIN (COSTS OFF) SELECT 1 FROM public.atlas_packets WHERE tags @> ARRAY['x']::text[]";
	const planBeforeDrop = psql(tagsQuery);
	assert.match(planBeforeDrop, /idx_atlas_packets_tags(?:_gin)?(?:\r?\n|$)/, 'Baseline synthetic tags query must use one of the duplicate indexes');
	const rowCountQuery = `SELECT sum(row_count)::bigint FROM (${[...tableColumns.keys()].map((table) => `SELECT count(*)::bigint AS row_count FROM public.\"${table}\"`).join(' UNION ALL ')}) counts`;
	const rowsBefore = psql(rowCountQuery);
	const dropFile = path.join(artifactDirectory, 'drop-indexes.sql');
	fs.writeFileSync(dropFile, dropStatements.join('\n'), 'utf8');
	run(path.join(postgresBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', dropFile]);
	const afterDrops = Number(psql("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname = ANY(ARRAY[" + [...indexNames].map((name) => `'${name}'`).join(',') + '])'));
	assert.equal(afterDrops, 0, 'All candidate indexes should be absent after the drop');
	const keepersAfterDrop = Number(psql("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname = ANY(ARRAY[" + [...keeperNames].map((name) => `'${name}'`).join(',') + '])'));
	assert.equal(keepersAfterDrop, keeperNames.size, 'All keeper indexes must remain after candidate drops');
	const planAfterDrop = psql(tagsQuery);
	assert.match(planAfterDrop, /idx_atlas_packets_tags(?:\r?\n|$)/, 'Synthetic tags query must use the keeper after candidate drops');
	assert.doesNotMatch(planAfterDrop, /idx_atlas_packets_tags_gin/);
	const rowsAfterDrops = psql(rowCountQuery);
	assert.equal(rowsAfterDrops, rowsBefore, 'Index drops must preserve every fixture row');
	run(path.join(postgresBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-f', rollbackFile]);
	const afterRollback = Number(psql("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname = ANY(ARRAY[" + [...indexNames].map((name) => `'${name}'`).join(',') + '])'));
	assert.equal(afterRollback, candidateIndexes.length, 'Rollback must recreate every dropped index');
	const rowsAfterRollback = psql(rowCountQuery);
	assert.equal(rowsAfterRollback, rowsBefore, 'Rollback must preserve every fixture row');
	const receipt = {
		status: 'DISPOSABLE_REHEARSAL_PASSED',
		postgresVersion: run(path.join(postgresBin, 'postgres.exe'), ['--version']),
		port,
		candidateIndexes: candidateIndexes.length,
		keeperIndexes: keeperNames.size,
		tables: tableColumns.size,
		syntheticAtlasPacketRows: 50000,
		tagsPlanBeforeDrop: planBeforeDrop,
		tagsPlanAfterDrop: planAfterDrop,
		fixtureRowsBefore: rowsBefore,
		fixtureRowsAfterDrops: rowsAfterDrops,
		fixtureRowsAfterRollback: rowsAfterRollback,
		candidateIndexesAfterDrops: afterDrops,
		candidateIndexesAfterRollback: afterRollback,
		liveDatabaseTouched: false,
		createdAt: new Date().toISOString()
	};
	fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
	process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
	if (serverStarted) run(path.join(postgresBin, 'pg_ctl.exe'), ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
}
