/**
 * Citation Database Seed Script
 * Seeds PostgreSQL with demo citations + collections
 *
 * Usage: npx tsx src/lib/server/db/seed-citations.ts
 * Or:    npm run db:seed:citations
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema-postgres';

const { Pool } = pg;

const DATABASE_URL =
	process.env.DATABASE_URL ||
	'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

const { citations, statutes, users } = schema;

async function seedCitations(): Promise<void> {
	console.log('[seed-citations] Starting citation seed...');

	try {
		// Get demo user for foreign key
		const [demoUser] = await db.select().from(users).where(eq(users.email, 'demo@legal-ai.local')).limit(1);

		if (!demoUser) {
			console.error('[seed-citations] Demo user not found. Run db:seed first.');
			process.exit(1);
		}

		// Seed statutes (legal references)
		const sampleStatutes = [
			{
				title: 'Fraud and False Statements',
				content: 'Whoever knowingly and willfully makes any materially false statement...',
				section: '18 U.S.C. § 1001',
				jurisdiction: 'federal',
				category: 'criminal'
			},
			{
				title: 'Civil Rights Act',
				content: 'All persons shall be entitled to the full and equal enjoyment...',
				section: '42 U.S.C. § 2000a',
				jurisdiction: 'federal',
				category: 'civil-rights'
			},
			{
				title: 'Wire Fraud',
				content: 'Whoever, having devised or intending to devise any scheme or artifice to defraud...',
				section: '18 U.S.C. § 1343',
				jurisdiction: 'federal',
				category: 'criminal'
			},
			{
				title: 'Freedom of Information Act',
				content: 'Each agency shall make available to the public information...',
				section: '5 U.S.C. § 552',
				jurisdiction: 'federal',
				category: 'administrative'
			},
			{
				title: 'Americans with Disabilities Act',
				content: 'No individual shall be discriminated against on the basis of disability...',
				section: '42 U.S.C. § 12112',
				jurisdiction: 'federal',
				category: 'civil-rights'
			}
		];

		console.log('[seed-citations] Inserting statutes...');
		const insertedStatutes = await db.insert(statutes)
			.values(sampleStatutes)
			.onConflictDoNothing()
			.returning();

		console.log(`[seed-citations] ✓ ${insertedStatutes.length} statutes inserted`);

		// Seed citations (references to statutes)
		const sampleCitations = [
			{
				citationText: '18 U.S.C. § 1001',
				caseId: null,
				sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/1001',
				createdBy: null
			},
			{
				citationText: '42 U.S.C. § 2000a',
				caseId: null,
				sourceUrl: 'https://www.law.cornell.edu/uscode/text/42/2000a',
				createdBy: null
			},
			{
				citationText: '18 U.S.C. § 1343',
				caseId: null,
				sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/1343',
				createdBy: null
			},
			{
				citationText: '5 U.S.C. § 552',
				caseId: null,
				sourceUrl: 'https://www.law.cornell.edu/uscode/text/5/552',
				createdBy: null
			},
			{
				citationText: '42 U.S.C. § 12112',
				caseId: null,
				sourceUrl: 'https://www.law.cornell.edu/uscode/text/42/12112',
				createdBy: null
			},
			{
				citationText: 'Miranda v. Arizona, 384 U.S. 436 (1966)',
				caseId: null,
				sourceUrl: 'https://supreme.justia.com/cases/federal/us/384/436/',
				createdBy: null
			},
			{
				citationText: 'Brown v. Board of Education, 347 U.S. 483 (1954)',
				caseId: null,
				sourceUrl: 'https://supreme.justia.com/cases/federal/us/347/483/',
				createdBy: null
			},
			{
				citationText: 'Roe v. Wade, 410 U.S. 113 (1973)',
				caseId: null,
				sourceUrl: 'https://supreme.justia.com/cases/federal/us/410/113/',
				createdBy: null
			}
		];

		console.log('[seed-citations] Inserting citations...');
		const insertedCitations = await db.insert(citations)
			.values(sampleCitations)
			.onConflictDoNothing()
			.returning();

		console.log(`[seed-citations] ✓ ${insertedCitations.length} citations inserted`);

		console.log('[seed-citations] ✓ Seed complete!');
		console.log(`
Summary:
  - Statutes: ${insertedStatutes.length}
  - Citations: ${insertedCitations.length}
  - Total: ${insertedStatutes.length + insertedCitations.length}

Test with:
  curl http://localhost:5173/api/citations
		`);

	} catch (err) {
		console.error('[seed-citations] Error:', err);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	seedCitations();
}
