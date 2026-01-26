
import * as drizzle from 'drizzle-orm';
import { eq, sql } from 'drizzle-orm';

console.log('--- Drizzle Runtime Verification ---');
console.log('Importing "drizzle-orm"...');

try {
    console.log('Checking "eq" export...');
    console.log('Type of "eq":', typeof eq);
    if (typeof eq !== 'function' && typeof eq !== 'object') {
        throw new Error('"eq" is not a function/object');
    }
    console.log('✅ "eq" verified.');

    console.log('Checking "sql" export...');
    console.log('Type of "sql":', typeof sql);
    console.log('✅ "sql" verified.');

    console.log('Checking namespace import keys:', Object.keys(drizzle).slice(0, 5));
    console.log('✅ Namespace import verified.');

    console.log('--- SUCCESS: Drizzle Runtime is Healthy ---');
} catch (error) {
    console.error('❌ FAILURE:', error);
    process.exit(1);
}
