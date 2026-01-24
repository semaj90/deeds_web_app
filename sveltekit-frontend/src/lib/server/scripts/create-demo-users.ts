import type { User } from '$lib/types';
/** * Create demo users for testing authentication * Demo Credentials: * - admin@example.com / Admin@123456 * - user@example.com / User@123456 */ import type { AuthService } from '../auth.js'; export async function createDemoUsers(): Promise<any> { const authService = new AuthService(); try { console.log('ðŸ” Creating demo users...'); // Demo admin user await authService.register({ email: 'admin@example.com', password: 'Admin@123456', firstName: 'Demo', lastName: 'Admin', displayName: 'Admin User' }); console.log('âœ… Admin created, admin@example.com / Admin@123456'); // Demo regular user await authService.register({ email: 'user@example.com', password: 'User@123456', firstName: 'Demo', lastName: 'User', displayName: 'Regular User' }); console.log('âœ… User created, user@example.com / User@123456'); console.log('âœ¨ Demo users ready for testing!')}catch (error) { if (error instanceof Error && error.message.includes('duplicate')) { console.log('â„¹ï¸ Demo users already exist')}else { console.error('âŒ Error creating demo users: ', error); throw error}
} }
// Run if executed directly if (import.meta.url === `file://${process.argv[1]}`) { createDemoUsers().catch(console.error)}




