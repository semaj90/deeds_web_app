/**
 * Seed test users for local development
 * Run with: npx tsx scripts/seed-test-users.ts
 */

import { db } from '../src/lib/server/db/connection';
import { users } from '../src/lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'prosecutor' | 'detective' | 'admin' | 'analyst' | 'paralegal';
}

const testUsers: TestUser[] = [
  {
    email: 'admin@legal.ai.dev',
    password: 'AdminPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  },
  {
    email: 'demo@legal-ai.com',
    password: 'demo123',
    firstName: 'Demo',
    lastName: 'User',
    role: 'prosecutor',
  },
  {
    email: 'prosecutor@legal.ai.dev',
    password: 'ProsecutorPass123!',
    firstName: 'John',
    lastName: 'Prosecutor',
    role: 'prosecutor',
  },
  {
    email: 'detective@legal.ai.dev',
    password: 'DetectivePass123!',
    firstName: 'Jane',
    lastName: 'Detective',
    role: 'detective',
  },
  {
    email: 'analyst@legal.ai.dev',
    password: 'AnalystPass123!',
    firstName: 'Alex',
    lastName: 'Analyst',
    role: 'analyst',
  },
];

async function seedUsers() {
  console.log('🌱 Seeding test users...\n');

  for (const testUser of testUsers) {
    try {
      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, testUser.email))
        .limit(1);

      if (existingUser) {
        console.log(`⏭️  Skipping ${testUser.email} (already exists)`);
        continue;
      }

      // Hash password with bcryptjs (matching login.ts behavior)
      const hashedPassword = await bcrypt.hash(testUser.password, 12);

      // Insert user
      await db.insert(users).values({
        email: testUser.email,
        hashedPassword,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        role: testUser.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      console.log(`✅ Created user: ${testUser.email} (role: ${testUser.role})`);
      console.log(`   Password: ${testUser.password}\n`);
    } catch (error) {
      console.error(`❌ Failed to create user ${testUser.email}:`, error);
    }
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('Test Credentials:');
  testUsers.forEach((u) => {
    console.log(`  📧 ${u.email} / 🔐 ${u.password}`);
  });
}

seedUsers().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
