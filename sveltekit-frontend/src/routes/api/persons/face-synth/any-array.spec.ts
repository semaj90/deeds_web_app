// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { inArray, sql } from 'drizzle-orm';
import { poiPhotos } from '$lib/server/db/schema-postgres.js';

const dialect = new PgDialect();
const ID = 'a1916468-1aa4-429a-8f4d-ca7c2f2ba4db';

// Runtime error (error_logs, today): `Failed query: select "poi_id", "thumbnail_url", "id" from "poi_photos"
// where "poi_photos"."poi_id" = ANY(($1))`, param = a bare uuid -> Postgres: malformed array literal.
describe('poi_photos id-list filters', () => {
	it('documents the bug: sql`= ANY(${array})` renders ANY(($1)), a parenthesised scalar, not an array', () => {
		const q = dialect.sqlToQuery(sql`${poiPhotos.poiId} = ANY(${[ID]})`);
		expect(q.sql).toContain('ANY(($1))');
		expect(q.params).toEqual([ID]);
	});

	it('inArray renders a valid IN list for one and many ids', () => {
		const one = dialect.sqlToQuery(inArray(poiPhotos.poiId, [ID]));
		expect(one.sql).toMatch(/"poi_id" in \(\$1\)/);
		expect(one.params).toEqual([ID]);

		const many = dialect.sqlToQuery(inArray(poiPhotos.poiId, [ID, 'b', 'c']));
		expect(many.sql).toMatch(/in \(\$1, \$2, \$3\)/);
	});

	it.each([
		'src/routes/api/persons/face-synth/+server.ts',
		'src/lib/server/ai/contextual-tools.ts',
	])('%s no longer filters poiPhotos with sql`= ANY(${...})`', (file) => {
		const source = readFileSync(file, 'utf8');
		expect(source).not.toMatch(/poiPhotos\.poiId\}\s*=\s*ANY\(\$\{/);
		expect(source).toMatch(/inArray\(poiPhotos\.poiId,/);
	});
});
