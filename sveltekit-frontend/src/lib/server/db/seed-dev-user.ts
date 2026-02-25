
import { db } from './drizzle';
import { users } from './schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function seed() {
    console.log('🌱 Seeding Dev User...');
    const devUserId = '00000000-0000-0000-0000-000000000001';

    try {
        const existing = await db.select().from(users).where(eq(users.id, devUserId)).limit(1);

        if (existing.length === 0) {
            await db.insert(users).values({
                id: devUserId,
                email: 'admin@yorha.dev',
                name: '2B',
                firstName: 'YoRHa',
                lastName: '2B',
                role: 'admin',
                passwordHash: 'dev_bypass_no_password',
                isActive: true
            });
            console.log('✅ Created Dev User (2B) with ID:', devUserId);
        } else {
            console.log('ℹ️ Dev User already exists.');
        }
    } catch (err) {
        console.error('❌ Failed to seed dev user:', err);
    }
    process.exit(0);
}

seed();
