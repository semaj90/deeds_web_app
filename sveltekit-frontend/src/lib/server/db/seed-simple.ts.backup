import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './drizzle.ts';
import { cases, users } from './schema.ts';

async function seed() {
	console.log('🌱 Starting database seed...');

	try {
		const passwordHash = await bcrypt.hash('password123', 12);
		const demoPasswordHash = await bcrypt.hash('demo123', 12);

		// Seed users
		const seedUsers = [
			{
				email: 'demo@legal-ai.local',
				name: 'Demo User',
				firstName: 'Demo',
				lastName: 'User',
				role: 'admin' as const,
				hashedPassword: demoPasswordHash,
				isActive: true
			},
			{
				email: 'prosecutor@legal.ai',
				name: 'John Prosecutor',
				firstName: 'John',
				lastName: 'Prosecutor',
				role: 'prosecutor' as const,
				hashedPassword: passwordHash,
				isActive: true
			},
			{
				email: 'detective@legal.ai',
				name: 'Jane Detective',
				firstName: 'Jane',
				lastName: 'Detective',
				role: 'detective' as const,
				hashedPassword: passwordHash,
				isActive: true
			}
		];

		const insertedUsers = [];
		for (const user of seedUsers) {
			try {
				const existing = await db.select().from(users).where(eq(users.email, user.email)).limit(1);

				if (existing.length === 0) {
					const [created] = await db.insert(users).values(user).returning();
					insertedUsers.push(created);
					console.log(`✅ Created user: ${user.email}`);
				} else {
					insertedUsers.push(existing[0]);
					console.log(`ℹ️ User already exists: ${user.email}`);
				}
			} catch (err) {
				console.error(`❌ Failed to create user ${user.email}:`, err);
			}
		}

		// Seed cases
		if (insertedUsers.length > 0) {
			const seedCases = [
				{
					caseNumber: 'CASE-2024-001',
					title: 'Financial Fraud Investigation',
					description: 'Complex financial fraud case with cryptocurrency transactions',
					priority: 'high' as const,
					status: 'open' as const,
					category: 'financial_fraud',
					dangerScore: 75,
					createdBy: insertedUsers[0].id,
					aiSummary: 'High-priority financial fraud case',
					aiTags: ['money_laundering', 'cryptocurrency']
				},
				{
					caseNumber: 'CASE-2024-002',
					title: 'Cybercrime Investigation',
					description: 'Data breach and identity theft case',
					priority: 'medium' as const,
					status: 'open' as const,
					category: 'cybercrime',
					dangerScore: 60,
					createdBy: insertedUsers[1]?.id ?? insertedUsers[0].id,
					aiSummary: 'Large-scale data breach investigation',
					aiTags: ['data_breach', 'identity_theft']
				}
			];

			for (const caseData of seedCases) {
				try {
					const existing = await db.select()
						.from(cases)
						.where(eq(cases.caseNumber, caseData.caseNumber))
						.limit(1);

					if (existing.length === 0) {
						await db.insert(cases).values(caseData);
						console.log(`✅ Created case: ${caseData.caseNumber}`);
					} else {
						console.log(`ℹ️ Case already exists: ${caseData.caseNumber}`);
					}
				} catch (err) {
					console.error(`❌ Failed to create case ${caseData.caseNumber}:`, err);
				}
			}
		}

		console.log('\n🎉 Database seed completed!');
		console.log('\nLogin credentials:');
		console.log('  demo@legal-ai.local / demo123');
		console.log('  prosecutor@legal.ai / password123');
		console.log('  detective@legal.ai / password123');

		process.exit(0);
	} catch (error) {
		console.error('❌ Seed failed:', error);
		process.exit(1);
	}
}

seed();



