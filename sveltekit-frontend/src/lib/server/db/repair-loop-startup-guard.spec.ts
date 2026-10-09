import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyError } from '../../../../scripts/agents/repair-registry.ts';
import { classifyPostgresError, shouldCreateRepairTask } from './readiness.js';

const startupError = 'the database system is starting up; error code 23505: duplicate key violates unique constraint';

describe('repair loop PostgreSQL startup guard', () => {
	it('skips STARTING and retryable database transients before repair classification or writes', () => {
		const source = readFileSync(resolve(process.cwd(), 'scripts/agents/repair-loop.ts'), 'utf8');
		const guard = source.match(/const databaseReadiness = classifyPostgresError\(event\.error\);\s*if \(!shouldCreateRepairTask\(databaseReadiness\)\) \{[\s\S]*?\n\s*\}/);
		const guardIndex = guard?.index ?? -1;
		const classification = source.indexOf('const classification = classifyError(event.error);');
		const cardCreation = source.indexOf('const card = buildTaskCard({');
		const cardWrite = source.indexOf('fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));');
		const taskUpsert = source.indexOf('await upsertTaskCard(pool, card);');

		expect(classifyPostgresError(startupError).state).toBe('starting');
		expect(classifyError(startupError).skillId).toBe('drizzle-23505-fix');
		expect(shouldCreateRepairTask(classifyPostgresError(startupError))).toBe(false);
		expect(shouldCreateRepairTask(classifyPostgresError('connect ECONNREFUSED 127.0.0.1:5434'))).toBe(false);
		expect(guard?.[0]).toContain('continue;');
		expect(guardIndex).toBeGreaterThanOrEqual(0);
		expect(classification).toBeGreaterThan(guardIndex);
		expect(cardCreation).toBeGreaterThan(classification);
		expect(cardWrite).toBeGreaterThan(cardCreation);
		expect(taskUpsert).toBeGreaterThan(cardWrite);
	});
});
