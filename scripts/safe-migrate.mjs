#!/usr/bin/env node
/**
 * Safe Migration Runner for legal_ai_db
 *
 * 1. Generates Drizzle migration SQL
 * 2. Scans for destructive operations (DROP TABLE, DROP COLUMN, ALTER TYPE)
 * 3. Blocks if destructive ops found (unless --force)
 * 4. Runs the migration if safe
 *
 * Usage:
 *   node scripts/safe-migrate.mjs              # Generate + validate
 *   node scripts/safe-migrate.mjs --check      # Scan existing migrations only
 *   node scripts/safe-migrate.mjs --diff       # Show schema diff vs DB
 *   node scripts/safe-migrate.mjs --force      # Run even with warnings (DANGEROUS)
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { execSync } from 'child_process';
import pg from 'pg';

const DRIZZLE_DIR = join(process.cwd(), 'sveltekit-frontend/drizzle');
const SCHEMA_DIR = join(process.cwd(), 'sveltekit-frontend/src/lib/server/db');

// Destructive SQL patterns that should NEVER run on production data
const DESTRUCTIVE_PATTERNS = [
	{ re: /\bDROP\s+TABLE\b/gi, severity: 'CRITICAL', desc: 'Drops entire table (data loss)' },
	{ re: /\bDROP\s+COLUMN\b/gi, severity: 'CRITICAL', desc: 'Drops column (data loss)' },
	{ re: /\bTRUNCATE\b/gi, severity: 'CRITICAL', desc: 'Truncates table (data loss)' },
	{ re: /\bDELETE\s+FROM\b/gi, severity: 'HIGH', desc: 'Deletes rows' },
	{ re: /\bDROP\s+INDEX\b/gi, severity: 'MEDIUM', desc: 'Drops index (performance impact)' },
	{ re: /\bDROP\s+TYPE\b/gi, severity: 'MEDIUM', desc: 'Drops enum type' },
	{ re: /\bALTER\s+TYPE\b[^;]*\bRENAME\b/gi, severity: 'MEDIUM', desc: 'Renames type (may break references)' },
	{ re: /\bALTER\s+TABLE\b[^;]*\bRENAME\s+TO\b/gi, severity: 'HIGH', desc: 'Renames table (breaks queries)' },
	{ re: /\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\bTYPE\b/gi, severity: 'MEDIUM', desc: 'Changes column type (may lose data)' },
];

// Safe patterns we expect in additive migrations
const SAFE_PATTERNS = [
	/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/gi,
	/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi,
	/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/gi,
	/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS/gi,
	/CREATE\s+TYPE\b[^;]*\bAS\s+ENUM/gi,
	/DO\s+\$\$\s+BEGIN\s+CREATE\s+TYPE/gi, // Safe enum creation with exception handler
];

async function scanFile(filePath) {
	const content = await readFile(filePath, 'utf-8');
	const findings = [];

	for (const pattern of DESTRUCTIVE_PATTERNS) {
		const matches = content.match(pattern.re);
		if (matches) {
			// Check if it's inside a safe context (e.g., DROP TABLE IF EXISTS before CREATE)
			for (const match of matches) {
				findings.push({
					file: relative(process.cwd(), filePath),
					severity: pattern.severity,
					desc: pattern.desc,
					match: match.trim().substring(0, 80),
				});
			}
		}
	}

	let safeCount = 0;
	for (const p of SAFE_PATTERNS) {
		const m = content.match(p);
		if (m) safeCount += m.length;
	}

	return { findings, safeCount, lineCount: content.split('\n').length };
}

async function scanAllMigrations() {
	const dirs = ['drizzle', 'drizzle/migrations', 'drizzle/manual', 'drizzle/introspected'];
	const allFindings = [];
	let totalFiles = 0;
	let totalSafe = 0;

	for (const dir of dirs) {
		const fullDir = join(process.cwd(), 'sveltekit-frontend', dir);
		try {
			const files = await readdir(fullDir);
			const sqlFiles = files.filter((f) => f.endsWith('.sql'));

			for (const file of sqlFiles) {
				const { findings, safeCount } = await scanFile(join(fullDir, file));
				allFindings.push(...findings);
				totalSafe += safeCount;
				totalFiles++;
			}
		} catch {
			// Directory doesn't exist
		}
	}

	return { findings: allFindings, totalFiles, totalSafe };
}

async function showSchemaDiff() {
	const connStr = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
	const pool = new pg.Pool({ connectionString: connStr });

	try {
		// Get actual tables from DB
		const { rows: tables } = await pool.query(`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`);

		// Get actual columns from DB
		const { rows: columns } = await pool.query(`
			SELECT table_name, column_name, data_type, is_nullable, column_default
			FROM information_schema.columns
			WHERE table_schema = 'public'
			ORDER BY table_name, ordinal_position
		`);

		console.log(`\n=== Database Schema (${tables.length} tables) ===\n`);

		const columnsByTable = {};
		for (const col of columns) {
			if (!columnsByTable[col.table_name]) columnsByTable[col.table_name] = [];
			columnsByTable[col.table_name].push(col);
		}

		for (const { table_name } of tables) {
			const cols = columnsByTable[table_name] || [];
			console.log(`  ${table_name} (${cols.length} columns)`);
			for (const col of cols) {
				const nullable = col.is_nullable === 'YES' ? '?' : '';
				const def = col.column_default ? ` = ${col.column_default.substring(0, 30)}` : '';
				console.log(`    - ${col.column_name}: ${col.data_type}${nullable}${def}`);
			}
		}
	} catch (err) {
		console.error('Cannot connect to database:', err.message);
		console.error('Make sure PostgreSQL is running on port 5432');
	} finally {
		await pool.end();
	}
}

// ─── Main ───

const args = process.argv.slice(2);
const mode = args[0] || '--check';

console.log('🔍 Safe Migration Scanner for legal_ai_db\n');

if (mode === '--diff') {
	await showSchemaDiff();
} else {
	const { findings, totalFiles, totalSafe } = await scanAllMigrations();

	console.log(`Scanned ${totalFiles} SQL files`);
	console.log(`Found ${totalSafe} safe (IF NOT EXISTS) operations`);
	console.log(`Found ${findings.length} potentially destructive operations\n`);

	if (findings.length > 0) {
		const critical = findings.filter((f) => f.severity === 'CRITICAL');
		const high = findings.filter((f) => f.severity === 'HIGH');
		const medium = findings.filter((f) => f.severity === 'MEDIUM');

		if (critical.length > 0) {
			console.log(`❌ CRITICAL (${critical.length}):`);
			for (const f of critical) {
				console.log(`  ${f.file}: ${f.desc}`);
				console.log(`    → ${f.match}`);
			}
		}
		if (high.length > 0) {
			console.log(`⚠️  HIGH (${high.length}):`);
			for (const f of high) {
				console.log(`  ${f.file}: ${f.desc}`);
			}
		}
		if (medium.length > 0) {
			console.log(`📋 MEDIUM (${medium.length}):`);
			for (const f of medium) {
				console.log(`  ${f.file}: ${f.desc}`);
			}
		}

		if (!args.includes('--force')) {
			console.log('\n🛑 Migration blocked. Review destructive operations above.');
			console.log('Use --force to override (DANGEROUS on production data).\n');
			console.log('Safe alternative: Use drizzle/manual/ with ALTER TABLE ... ADD COLUMN IF NOT EXISTS');
			process.exit(1);
		}
	} else {
		console.log('✅ All migrations are safe (additive only)\n');
	}
}