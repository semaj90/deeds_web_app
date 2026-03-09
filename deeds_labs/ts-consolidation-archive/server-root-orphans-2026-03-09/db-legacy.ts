/**
 * Database Connection Module
 * Provides a singleton PostgreSQL connection using the postgres library
 */

import postgres from 'postgres';
import { ENV } from '$lib/server/env.server.js';

const databaseUrl = ENV.DATABASE_URL;

export const sql = postgres(databaseUrl, {
 max: 20,
 idle_timeout: 30,
 connect_timeout: 10,
});

sql`SELECT 1`
 .then(() => {
 console.log('✅ Database connection established');
 })
 .catch((err) => {
 console.error('❌ Database connection failed:', err.message);
 });

export default sql;



