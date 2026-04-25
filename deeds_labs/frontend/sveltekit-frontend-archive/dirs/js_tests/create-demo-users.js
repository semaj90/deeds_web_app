// Create demo users for testing login functionality
// These match the demo credentials in the login page

import { db } from './src/lib/server/db/index.js';
import { users } from './src/lib/server/db/schema.js';
import { hashPassword } from './src/lib/server/authUtils.js';

async function createDemoUsers() {
  try {
    console.log('Creating demo users...');

    // Demo user 1: Admin
    const adminHashedPassword = await hashPassword('admin123');
    await db
      .insert(users)
      .values({
        email: 'admin@example.com',
        hashedPassword: adminHashedPassword,
        name: 'Demo Admin',
        firstName: 'Demo',
        lastName: 'Admin',
        role: 'admin',
      })
      .onConflictDoNothing();

    // Demo user 2: Regular user
    const userHashedPassword = await hashPassword('user123');
    await db
      .insert(users)
      .values({
        email: 'user@example.com',
        hashedPassword: userHashedPassword,
        name: 'Demo User',
        firstName: 'Demo',
        lastName: 'User',
        role: 'prosecutor',
      })
      .onConflictDoNothing();

    console.log('Demo users created successfully!');
    console.log('Admin: admin@example.com / admin123');
    console.log('User: user@example.com / user123');
  } catch (error) {
    console.error('Error creating demo users:', error);
  }
}

createDemoUsers();
