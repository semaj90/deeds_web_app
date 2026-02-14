import type { User } from '$lib/types';

/**
 * Create demo users for testing authentication
 * Demo Credentials:
 * - admin@example.com / Admin@123456
 * - user@example.com / User@123456
 */
import type { AuthService } from '../auth.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export async function createDemoUsers(): Promise<any> {
    // Dynamically import AuthService to avoid circular dependencies
    const { AuthService } = await import('../auth.js');
    const authService = new AuthService();

    try {
        console.log('🔐 Creating demo users...');

        // Demo admin user
        await authService.register({
            email: 'admin@example.com',
            password: 'Admin@123456',
            firstName: 'Demo',
            lastName: 'Admin',
            displayName: 'Admin User'
        });
        console.log('✅ Admin created: admin@example.com / Admin@123456');

        // Demo regular user
        await authService.register({
            email: 'user@example.com',
            password: 'User@123456',
            firstName: 'Demo',
            lastName: 'User',
            displayName: 'Regular User'
        });
        console.log('✅ User created: user@example.com / User@123456');

        console.log('✨ Demo users ready for testing!');
    } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate')) {
            console.log('ℹ️ Demo users already exist');
        } else {
            console.error('❌ Error creating demo users:', error);
            throw error;
        }
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    createDemoUsers().catch(console.error);
}
