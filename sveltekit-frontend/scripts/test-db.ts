
import { db } from '../src/lib/server/db/client';
import { users } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';

async function testDb() {
    try {
        console.log('Testing DB connection...');
        const result = await db.select().from(users).limit(1);
        console.log('Success. Users found:', result.length);

        console.log('Attempting insert...');
        const newUser = await db.insert(users).values({
            email: `test_${Date.now()}@example.com`,
            passwordHash: 'hash',
            firstName: 'Test',
            lastName: 'Script',
            role: 'prosecutor',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }).returning();
        console.log('Insert success:', newUser[0].id);

    } catch (e: any) {
        console.error('DB Error:', e.message);
        console.error('Full Error:', e);
    } finally {
        process.exit(0);
    }
}

testDb();
