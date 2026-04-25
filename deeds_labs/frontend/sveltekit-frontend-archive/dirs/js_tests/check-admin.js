#!/usr/bin/env node

import { db } from './src/lib/server/db/index.js';
import { users } from './src/lib/server/db/schema-postgres.js';

async function checkAdminUsers() {
  try {
    console.log('🔍 Checking admin users in database...');

    const allUsers = await db.select().from(users);

    console.log(`\n📊 Found ${allUsers.length} users:`);

    allUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Role: ${user.role}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Created: ${user.createdAt}`);
    });

    const adminUsers = allUsers.filter((user) => user.role === 'admin');
    console.log(`\n👑 Admin users: ${adminUsers.length}`);

    if (adminUsers.length > 0) {
      console.log('\n🔑 Admin credentials for testing:');
      adminUsers.forEach((admin) => {
        console.log(`   Email: ${admin.email}`);
        console.log(`   Name: ${admin.name}`);
        // Note: We can't show the password as it's hashed
      });
    }

    console.log('\n💡 For login testing, try these demo credentials:');
    console.log('   admin@example.com / admin123');
    console.log('   user@example.com / user123');
  } catch (error) {
    console.error('❌ Error checking admin users:', error);
  } finally {
    process.exit(0);
  }
}

checkAdminUsers();
