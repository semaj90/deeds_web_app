
import { eq } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const load = async () => {
    console.log('Verifying Drizzle Runtime Import...');
    try {
        // Just verify eq is a function (or object depending on implementation)
        const type = typeof eq;
        console.log('Drizzle "eq" import type:', type);

        if (type !== 'function' && type !== 'object') {
            throw new Error('drizzle-orm "eq" export is missing or invalid at runtime');
        }

        return {
            status: 'success',
            message: 'Drizzle Runtime Verified',
            eqType: type
        };
    } catch (e) {
        console.error('Drizzle Verification Failed:', e);
        return {
            status: 'error',
            message: e.message
        };
    }
};
