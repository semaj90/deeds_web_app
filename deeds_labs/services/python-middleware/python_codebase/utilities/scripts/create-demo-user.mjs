#!/usr/bin/env node
'use strict';

// Create and return a simple demo user object
function createDemoUser() {
  return {
	id: 'demo-user',
	name: 'Demo User',
	email: 'demo@example.com',
	createdAt: new Date().toISOString(),
	roles: ['user']
  };
}

// If run as a script, print the demo user as JSON to stdout.
try {
  const user = createDemoUser();
  // Print JSON for easy consumption by other tools/CI
  console.log(JSON.stringify(user, null, 2));
} catch (err) {
  console.error('Error creating demo user:', err && err.stack ? err.stack : err);
  process.exit(1);
}

export default createDemoUser;
