/**
 * Database Seed Script - Drizzle ORM 0.44
 * ENHANCED DEMO SEED for Playwright testing
 *
 * Creates comprehensive test data:
 * - 1 demo admin user
 * - 10 cases with deterministic IDs
 * - 8 evidence items per case (80 total)
 * - 4 POIs per case (40 total)
 * - 2 reports per case (20 total)
 *
 * All IDs are deterministic for stable Playwright tests.
 *
 * Usage: npx tsx src/lib/server/db/seed.ts
 * Or:    npm run db:seed
 */

import bcrypt from 'bcryptjs';
import { eq, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema-postgres';
import crypto from 'crypto';

import { ENV } from '$lib/server/env.server.js';

const { Pool } = pg;

const DATABASE_URL = ENV.DATABASE_URL;

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

const { users, cases, evidence, personsOfInterest, reports } = schema;

// Deterministic UUIDs for stable tests
function deterministicUUID(prefix: string, id: number): string {
	const hex = id.toString(16).padStart(12, '0');
	return `${prefix}-0000-0000-0000-${hex}`;
}

async function seed(): Promise<void> {
	console.log('[seed] Starting ENHANCED database seed...');
	console.log('[seed] Database:', DATABASE_URL.replace(/:[^@]+@/, ':****@'));

	try {
		// Ensure sessions table exists (Lucia v3 requirement)
		await pool.query(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY NOT NULL,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				expires_at TIMESTAMPTZ NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
		`);
		console.log('[seed] Sessions table ready.');

		// All users share password123 for demo simplicity
		const passwordHash = await bcrypt.hash('password123', 12);

		// === SEED USERS ===
		const seedUsers = [
			{
				email: 'demo@legal-ai.local',
				name: 'Demo User',
				firstName: 'Demo',
				lastName: 'User',
				role: 'admin' as const,
				passwordHash,
				isActive: true,
				hasCompletedOnboarding: true,
				onboardingStep: 10
			},
			{
				email: 'prosecutor@legal.ai',
				name: 'John Prosecutor',
				firstName: 'John',
				lastName: 'Prosecutor',
				role: 'prosecutor' as const,
				passwordHash,
				isActive: true,
				hasCompletedOnboarding: true,
				onboardingStep: 10
			},
			{
				email: 'detective@legal.ai',
				name: 'Jane Detective',
				firstName: 'Jane',
				lastName: 'Detective',
				role: 'detective' as const,
				passwordHash,
				isActive: true,
				hasCompletedOnboarding: true,
				onboardingStep: 10
			},
			{
				email: 'admin@legal.ai',
				name: 'Admin User',
				firstName: 'Admin',
				lastName: 'User',
				role: 'admin' as const,
				passwordHash,
				isActive: true,
				hasCompletedOnboarding: true,
				onboardingStep: 10
			}
		];

		console.log('[seed] Upserting demo users...');
		let userCount = 0;

		for (const user of seedUsers) {
			const existing = await db
				.select()
				.from(users)
				.where(eq(users.email, user.email))
				.limit(1);

			if (existing.length === 0) {
				await db.insert(users).values({
					email: user.email,
					passwordHash: user.passwordHash,
					name: user.name,
					firstName: user.firstName,
					lastName: user.lastName,
					role: user.role,
					isActive: user.isActive,
					hasCompletedOnboarding: user.hasCompletedOnboarding,
					onboardingStep: user.onboardingStep
				});
				console.log(`  + Created: ${user.email}`);
			} else {
				await db
					.update(users)
					.set({
						passwordHash: user.passwordHash,
						firstName: user.firstName,
						lastName: user.lastName,
						name: user.name,
						role: user.role,
						isActive: user.isActive,
						hasCompletedOnboarding: user.hasCompletedOnboarding,
						onboardingStep: user.onboardingStep,
						updatedAt: new Date().toISOString()
					})
					.where(eq(users.email, user.email));
				console.log(`  ~ Refreshed: ${user.email}`);
			}
			userCount++;
		}

		console.log(`\n[seed] ✅ ${userCount} users created/updated.`);

		// Get demo user for case ownership
		const demoUser = await db
			.select()
			.from(users)
			.where(eq(users.email, 'demo@legal-ai.local'))
			.limit(1);

		if (demoUser.length === 0) {
			throw new Error('Demo user not found - cannot seed cases');
		}

		const userId = demoUser[0].id;

		// === SEED CASES (10 cases with realistic mix) ===
		console.log('\n[seed] Creating 10 demo cases...');

		const casesToCreate = [
			{
				title: 'State v. Johnson - Fraud Investigation',
				description: 'Investigation into alleged fraudulent financial transactions involving multiple shell companies',
				status: 'active' as const,
				priority: 'high' as const,
				caseType: 'criminal' as const,
				caseNumber: 'CASE-DEMO-001',
				userId,
			},
			{
				title: 'City Housing Authority v. Tenants Association',
				description: 'Civil dispute regarding building code violations and tenant rights',
				status: 'active' as const,
				priority: 'medium' as const,
				caseType: 'civil' as const,
				caseNumber: 'CASE-DEMO-002',
				userId,
			},
			{
				title: 'People v. Martinez - Drug Trafficking',
				description: 'Multi-jurisdiction drug trafficking case with evidence spanning 18 months',
				status: 'pending' as const,
				priority: 'high' as const,
				caseType: 'criminal' as const,
				caseNumber: 'CASE-DEMO-003',
				userId,
			},
			{
				title: 'Mills Contract Dispute',
				description: 'Breach of contract claim involving construction defects',
				status: 'active' as const,
				priority: 'medium' as const,
				caseType: 'civil' as const,
				caseNumber: 'CASE-DEMO-004',
				userId,
			},
			{
				title: 'Riverside Property Fraud',
				description: 'Real estate fraud investigation with forged documents',
				status: 'active' as const,
				priority: 'high' as const,
				caseType: 'criminal' as const,
				caseNumber: 'CASE-DEMO-005',
				userId,
			},
			{
				title: 'State v. Holloway - Embezzlement',
				description: 'Corporate embezzlement case spanning 3 years',
				status: 'closed' as const,
				priority: 'medium' as const,
				caseType: 'criminal' as const,
				caseNumber: 'CASE-DEMO-006',
				userId,
			},
			{
				title: 'People v. Ortega - Corporate Espionage',
				description: 'Trade secret theft and industrial espionage',
				status: 'active' as const,
				priority: 'critical' as const,
				caseType: 'criminal' as const,
				caseNumber: 'CASE-DEMO-007',
				userId,
			},
			{
				title: 'Johnson v. MedTech Corp - Medical Device Liability',
				description: 'Product liability case involving defective medical devices',
				status: 'pending' as const,
				priority: 'high' as const,
				caseType: 'civil' as const,
				caseNumber: 'CASE-DEMO-008',
				userId,
			},
			{
				title: 'In re: Estate of Williams',
				description: 'Probate dispute with contested will',
				status: 'active' as const,
				priority: 'low' as const,
				caseType: 'civil' as const,
				caseNumber: 'CASE-DEMO-009',
				userId,
			},
			{
				title: 'State v. Chen - Identity Theft Ring',
				description: 'Organized identity theft operation with 200+ victims',
				status: 'active' as const,
				priority: 'critical' as const,
				caseType: 'criminal' as const,
				caseNumber: 'CASE-DEMO-010',
				userId,
			},
		];

		const createdCases: Array<{ id: string; title: string; caseNumber: string }> = [];

		for (const caseData of casesToCreate) {
			const existing = await db
				.select()
				.from(cases)
				.where(eq(cases.caseNumber, caseData.caseNumber))
				.limit(1);

			let caseId: string;

			if (existing.length === 0) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { caseType: _ct, ...caseInsertData } = caseData;
				const [inserted] = await db
					.insert(cases)
					.values(caseInsertData)
					.returning({ id: cases.id, title: cases.title, caseNumber: cases.caseNumber });
				caseId = inserted.id;
				console.log(`  + Created case: ${inserted.title}`);
			} else {
				caseId = existing[0].id;
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { caseType: _ct2, ...caseUpdateData } = caseData;
				await db
					.update(cases)
					.set({
						...caseUpdateData,
						updatedAt: new Date().toISOString(),
					})
					.where(eq(cases.id, caseId));
				console.log(`  ~ Updated case: ${caseData.title}`);
			}

			createdCases.push({ id: caseId, title: caseData.title, caseNumber: caseData.caseNumber! });
		}

		console.log(`\n[seed] ✅ ${createdCases.length} cases ready.`);

		// === SEED EVIDENCE (8 per case = 80 total) ===
		console.log('\n[seed] Creating 8 evidence items per case (80 total)...');
		let evidenceCount = 0;

		const evidenceTypes = ['document', 'photo', 'audio', 'video', 'physical'] as const;
		const evidenceTemplates = [
			{ title: 'Email correspondence', ext: 'pdf', type: 'document' as const },
			{ title: 'Bank statement', ext: 'pdf', type: 'document' as const },
			{ title: 'Surveillance photo', ext: 'jpg', type: 'photo' as const },
			{ title: 'Security camera footage', ext: 'mp4', type: 'video' as const },
			{ title: 'Phone call recording', ext: 'mp3', type: 'audio' as const },
			{ title: 'Contract agreement', ext: 'pdf', type: 'document' as const },
			{ title: 'Financial records', ext: 'xlsx', type: 'document' as const },
			{ title: 'Witness statement', ext: 'pdf', type: 'document' as const },
		];

		for (const caseRecord of createdCases) {
			let addedInCase = 0;
			let existingInCase = 0;
			for (let i = 0; i < 8; i++) {
				const template = evidenceTemplates[i];
				const title = `${template.title} - ${caseRecord.caseNumber}-E${i + 1}`;
				
				// Create a deterministic hash for idempotency
				const hashBase = `${caseRecord.id}:${title}:${i}`;
				const deterministicHash = `sha256:${crypto.createHash('sha256').update(hashBase).digest('hex')}`;

				const evidenceData = {
					caseId: caseRecord.id,
					title,
					description: `Evidence item ${i + 1} for ${caseRecord.title}`,
					evidenceType: template.type,
					fileName: `evidence-${caseRecord.caseNumber}-${i + 1}.${template.ext}`,
					fileSize: Math.floor(Math.random() * 5000000) + 100000,
					hash: deterministicHash,
					fileUrl: `minio://evidence/${caseRecord.id}/evidence-${i + 1}.${template.ext}`,
					uploadedBy: userId,
				};

				const existing = await db
					.select()
					.from(evidence)
					.where(eq(evidence.hash, evidenceData.hash))
					.limit(1);

				if (existing.length === 0) {
					await db.insert(evidence).values({
						...evidenceData,
						metadata: {
							uploadedVia: 'seed-script',
							textLength: Math.floor(Math.random() * 5000) + 1000,
							extractionMethod: 'pdf-parse',
							entityCount: Math.floor(Math.random() * 50) + 10,
							demoSeed: true,
						},
					});
					addedInCase++;
				} else {
					existingInCase++;
				}
			}
			console.log(`  + ${caseRecord.caseNumber}: ${addedInCase} added, ${existingInCase} verified`);
			evidenceCount += addedInCase;
		}


		console.log(`\n[seed] ✅ ${evidenceCount} evidence items created.`);

		// === SEED PERSONS OF INTEREST (4 per case = 40 total) ===
		console.log('\n[seed] Creating 4 POIs per case (40 total)...');
		let poiCount = 0;

		const poiTemplates = [
			{
				name: 'Primary Suspect',
				role: 'suspect',
				threatLevel: 'high' as const,
				status: 'active' as const,
			},
			{
				name: 'Key Witness',
				role: 'witness',
				threatLevel: 'low' as const,
				status: 'cleared' as const,
			},
			{
				name: 'Person of Interest',
				role: 'person-of-interest',
				threatLevel: 'medium' as const,
				status: 'surveillance' as const,
			},
			{
				name: 'Associate',
				role: 'associate',
				threatLevel: 'medium' as const,
				status: 'wanted' as const,
			},
		];

		const firstNames = ['Robert', 'Sarah', 'Michael', 'Jennifer', 'David', 'Lisa', 'James', 'Maria'];
		const lastNames = ['Johnson', 'Williams', 'Chen', 'Garcia', 'Martinez', 'Rodriguez', 'Davis', 'Miller'];

		for (let caseIdx = 0; caseIdx < createdCases.length; caseIdx++) {
			const caseRecord = createdCases[caseIdx];
			let addedInCase = 0;
			let existingInCase = 0;

			for (let poiIdx = 0; poiIdx < 4; poiIdx++) {
				const template = poiTemplates[poiIdx];
				const firstName = firstNames[caseIdx % firstNames.length];
				const lastName = lastNames[poiIdx];
				const fullName = `${firstName} ${lastName}`;

				const poiData = {
					name: fullName,
					aliases: [firstName.substring(0, 2) + lastName.substring(0, 1)],
					description: `${template.name} in ${caseRecord.title}`,
					threatLevel: template.threatLevel,
					status: template.status,
					relationship: template.role,
				};

				const existing = await db
					.select()
					.from(personsOfInterest)
					.where(
						and(
							eq(personsOfInterest.name, poiData.name),
							eq(personsOfInterest.description, poiData.description)
						)
					)
					.limit(1);

				if (existing.length === 0) {
					await db.insert(personsOfInterest).values(poiData);
					addedInCase++;
				} else {
					existingInCase++;
				}
			}
			console.log(`  + ${caseRecord.caseNumber}: ${addedInCase} added, ${existingInCase} verified`);
			poiCount += addedInCase;
		}


		console.log(`\n[seed] ✅ ${poiCount} POI records created.`);

		// === SEED REPORTS (2 per case = 20 total) ===
		console.log('\n[seed] Creating 2 reports per case (20 total)...');
		let reportCount = 0;

		for (const caseRecord of createdCases) {
			let addedInCase = 0;
			let existingInCase = 0;
			const reportRecords = [
				{
					caseId: caseRecord.id,
					createdBy: Number(userId),
					title: `Initial Investigation Summary - ${caseRecord.caseNumber}`,
					type: 'investigation_summary',
					content: `
# Investigation Summary - ${caseRecord.title}

## Overview
This report summarizes the initial findings of the investigation.

## Key Findings
- Evidence collected and catalogued
- Witnesses interviewed
- Timeline established
- Potential leads identified

## Evidence Analysis
- Multiple documents reviewed
- Digital forensics conducted
- Physical evidence processed

## Recommendations
1. Continue investigation
2. Coordinate with relevant agencies
3. Schedule follow-up interviews

## Status
Investigation ongoing.
					`.trim(),
					status: 'published' as const,
				},
				{
					caseId: caseRecord.id,
					createdBy: Number(userId),
					title: `Forensic Analysis - ${caseRecord.caseNumber}`,
					type: 'forensic_analysis',
					content: `
# Forensic Analysis Report - ${caseRecord.title}

## Document Analysis
Comprehensive review of all submitted evidence.

## Findings
- Pattern analysis completed
- Cross-reference with known cases
- Expert consultation obtained

## Methodology
- AI-assisted pattern detection
- Manual expert review
- Multi-source verification

## Conclusions
Analysis supports further investigation.
					`.trim(),
					status: 'published' as const,
				},
			];

			for (const report of reportRecords) {
				const existing = await db
					.select()
					.from(reports)
					.where(
						and(
							eq(reports.caseId, report.caseId),
							eq(reports.title, report.title)
						)
					)
					.limit(1);

				if (existing.length === 0) {
					await db.insert(reports).values(report);
					addedInCase++;
				} else {
					existingInCase++;
				}
			}
			console.log(`  + ${caseRecord.caseNumber}: ${addedInCase} added, ${existingInCase} verified`);
			reportCount += addedInCase;
		}


		// Get total counts from DB for summary
		const [allUsers] = await db.select({ count: sql`count(*)` }).from(users);
		const [allCases] = await db.select({ count: sql`count(*)` }).from(cases);
		const [allEvidence] = await db.select({ count: sql`count(*)` }).from(evidence);
		const [allPOIs] = await db.select({ count: sql`count(*)` }).from(personsOfInterest);
		const [allReports] = await db.select({ count: sql`count(*)` }).from(reports);

		console.log('\n' + '='.repeat(60));
		console.log('  ENHANCED DATABASE SEED COMPLETE');
		console.log('='.repeat(60));
		console.log('');
		console.log(`📊 Summary (Total in Database):`);
		console.log(`  • ${allUsers.count} users`);
		console.log(`  • ${allCases.count} cases`);
		console.log(`  • ${allEvidence.count} evidence items`);
		console.log(`  • ${allPOIs.count} persons of interest`);
		console.log(`  • ${allReports.count} reports`);

		console.log('');
		console.log('🔐 Login Credentials (all use password123):');
		console.log('  demo@legal-ai.local  (admin)   ← Use this for Playwright tests');
		console.log('  prosecutor@legal.ai  (prosecutor)');
		console.log('  detective@legal.ai   (detective)');
		console.log('  admin@legal.ai       (admin)');
		console.log('');
		console.log('📝 Test Data Available:');
		console.log(`  • 10 cases with deterministic case numbers (CASE-DEMO-001 to 010)`);
		console.log(`  • 8 evidence items per case (80 total)`);
		console.log(`  • 4 POIs per case (40 total)`);
		console.log(`  • 2 reports per case (20 total)`);
		console.log('');
		console.log('🎭 Playwright-Ready:');
		console.log(`  • Stable case numbers for navigation`);
		console.log(`  • Mix of statuses (active, pending, closed)`);
		console.log(`  • Realistic data density`);
		console.log('');
	} catch (error) {
		console.error('[seed] Fatal error:', error);
		throw error;
	} finally {
		await pool.end();
		console.log('[seed] Pool closed.');
	}
}

seed()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));

export { seed };
