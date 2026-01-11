import { json } from '@sveltejs/kit';
import type { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
 try {
 // Perform a simple query to test the database connection
 const result = await db.execute(sql`SELECT 1 as connected;`);

 // Check if the query returned a result
 if (result && result.length > 0) {
 return json({
 status: 'success',
 message: 'Database connected successfully!',
 data: result[0],
 });
 } else {
 return json(
 { status: 'error', message: 'Database query returned no results.' },
 { status: 500 }
 );
 }
 } catch (error: unknown) {
 console.error('Database connection test failed:', error);
 let errorMessage = 'Unknown database error.';
 if (error instanceof Error) {
 errorMessage = error.message;
 }
 return json(
 { status: 'error', message: 'Database connection failed.', error: errorMessage },
 { status: 500 }
 );
 }
}

