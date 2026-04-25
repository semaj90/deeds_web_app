import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { yorhaCases } from '../src/lib/db/schema/yorha';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

// Use the connection string from your environment or hardcode for test
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/legal_ai_db';
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log('Testing YoRHa schema connection...');

  try {
    // Insert a test case
    const testCaseNum = `TEST-${Date.now()}`;
    console.log(`Creating test case: ${testCaseNum}`);

    // We need a user ID first
    const users = await client`SELECT id FROM users LIMIT 1`;
    if (users.length === 0) {
        console.error('No users found to attach case to!');
        process.exit(1);
    }
    const userId = users[0].id;

    const inserted = await db.insert(yorhaCases).values({
      caseNumber: testCaseNum,
      title: 'YoRHa Integration Test',
      description: 'Automated test case',
      createdBy: userId
    }).returning();

    console.log('Inserted case:', inserted[0]);

    // Query it back
    const queried = await db.select().from(yorhaCases).where(eq(yorhaCases.caseNumber, testCaseNum));
    console.log('Queried case:', queried[0]);

    if (queried[0].title === 'YoRHa Integration Test') {
        console.log('✅ SUCCESS: YoRHa schema is working!');
    } else {
        console.error('❌ FAILURE: Data mismatch');
    }

    // Cleanup
    await db.delete(yorhaCases).where(eq(yorhaCases.caseNumber, testCaseNum));
    console.log('Cleanup complete');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

main();
