import { fileURLToPath } from 'url';

/**
 * Determine whether the given email belongs to a demo account.
 * Adjust the logic below to match your application's demo-user rules.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isDemoUser(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  // Example rules:
  // - matches an explicit environment variable DEMO_USER_EMAIL
  // - belongs to a demo domain (example.com) — change or remove as needed
  const envDemo = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (envDemo && normalized === envDemo) return true;

  if (normalized.endsWith('@example.com')) return true;

  // explicit demo account alias
  if (normalized === 'demo@example.com') return true;

  return false;
}

// Allow running as a script: node check-demo-user.mjs email@example.com
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const email = process.argv[2];
  if (!email) {
	console.error('Usage: node check-demo-user.mjs <email>');
	process.exit(2);
  }
  console.log(isDemoUser(email) ? 'true' : 'false');
}
