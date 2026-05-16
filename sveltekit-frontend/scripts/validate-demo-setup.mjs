/**
 * Validation Script - Demo Setup Readiness Check
 *
 * Verifies:
 * - Dev server is running
 * - Demo user exists
 * - Dev login endpoint works
 * - Seeded data is accessible
 * - Playwright auth fixture is ready
 */

import { Pool } from 'pg';

const DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEV_SERVER_URL = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';

async function checkDevServer() {
	try {
		const response = await fetch(DEV_SERVER_URL);
		if (response.ok) {
			console.log('✅ Dev server is running');
			return true;
		}
	} catch (e) {
		console.error('❌ Dev server is NOT running');
		console.error('   Run: npm run dev');
		return false;
	}
}

async function checkDemoUser() {
	const pool = new Pool({ connectionString: DATABASE_URL });
	try {
		const result = await pool.query(
			"SELECT id, email, role FROM users WHERE email = 'demo@legal-ai.local'"
		);
		if (result.rows.length > 0) {
			const user = result.rows[0];
			console.log(`✅ Demo user exists: ${user.email} (${user.role})`);
			return true;
		} else {
			console.error('❌ Demo user NOT found');
			console.error('   Run: npm run db:seed:demo');
			return false;
		}
	} catch (e) {
		console.error('❌ Database connection failed');
		console.error('   Error:', e.message);
		return false;
	} finally {
		await pool.end();
	}
}

async function checkLoginEndpoint() {
	try {
		const response = await fetch(`${DEV_SERVER_URL}/api/dev/login-demo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		if (response.ok) {
			const data = await response.json();
			console.log(`✅ Login endpoint works: ${data.user.email}`);
			return true;
		} else {
			const error = await response.json();
			console.error('❌ Login endpoint failed:', error.message);
			return false;
		}
	} catch (e) {
		console.error('❌ Login endpoint unreachable');
		console.error('   Error:', e.message);
		return false;
	}
}

async function checkSeededData() {
	const pool = new Pool({ connectionString: DATABASE_URL });
	try {
		const cases = await pool.query(
			"SELECT COUNT(*) as count FROM cases WHERE case_number LIKE 'CASE-DEMO-%'"
		);
		const evidence = await pool.query(
			"SELECT COUNT(*) as count FROM evidence WHERE metadata->>'demoSeed' = 'true'"
		);
		const poi = await pool.query(
			"SELECT COUNT(*) as count FROM persons_of_interest"
		);
		const reports = await pool.query(
			"SELECT COUNT(*) as count FROM reports WHERE type IN ('investigation_summary', 'forensic_analysis')"
		);

		console.log('✅ Seeded data verified:');
		console.log(`   • ${cases.rows[0].count} demo cases`);
		console.log(`   • ${evidence.rows[0].count} evidence items`);
		console.log(`   • ${poi.rows[0].count} POIs`);
		console.log(`   • ${reports.rows[0].count} reports`);

		return parseInt(cases.rows[0].count) >= 10;
	} catch (e) {
		console.error('❌ Failed to query seeded data');
		console.error('   Error:', e.message);
		return false;
	} finally {
		await pool.end();
	}
}

async function checkPlaywrightFixture() {
	const fs = await import('fs');
	const path = await import('path');

	const fixturePath = path.resolve('tests/fixtures/demo-auth.ts');
	const testPath = path.resolve('tests/e2e/demo-seed.spec.ts');

	if (fs.existsSync(fixturePath)) {
		console.log('✅ Playwright auth fixture exists');
	} else {
		console.error('❌ Playwright auth fixture NOT found');
		return false;
	}

	if (fs.existsSync(testPath)) {
		console.log('✅ Example Playwright test exists');
	} else {
		console.error('❌ Example Playwright test NOT found');
		return false;
	}

	return true;
}

async function main() {
	console.log('🔍 Validating Demo Setup...\n');

	const checks = [
		await checkDevServer(),
		await checkDemoUser(),
		await checkLoginEndpoint(),
		await checkSeededData(),
		await checkPlaywrightFixture()
	];

	const allPassed = checks.every(c => c);

	console.log('\n' + '='.repeat(60));
	if (allPassed) {
		console.log('✅ ALL CHECKS PASSED - Ready for Playwright testing!');
		console.log('='.repeat(60));
		console.log('\nRun Playwright tests:');
		console.log('  npm run test:e2e:demo');
		process.exit(0);
	} else {
		console.log('❌ SOME CHECKS FAILED - Fix issues above');
		console.log('='.repeat(60));
		process.exit(1);
	}
}

main();
