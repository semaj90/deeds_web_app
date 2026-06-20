
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

async function seed() {
    console.log('🌱 Seeding Dev User...');
    const devUserEmail = 'admin@yorha.dev';

    try {
        const existing = await db.select().from(users).where(eq(users.email, devUserEmail)).limit(1);

        if (existing.length === 0) {
            await db.insert(users).values({
                email: devUserEmail,
                name: '2B',
                firstName: 'YoRHa',
                lastName: '2B',
                role: 'admin',
                passwordHash: 'dev_bypass_no_password',
                isActive: true
            });
            console.log('✅ Created Dev User (2B)');
        } else {
            console.log('ℹ️ Dev User already exists.');
        }
    } catch (err) {
        console.error('❌ Failed to seed dev user:', err);
    }
}

const isMain = process.argv[1] && (process.argv[1].endsWith('seed-dev-user.ts') || process.argv[1].endsWith('seed-dev-user.js'));
if (isMain) {
    seed()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
