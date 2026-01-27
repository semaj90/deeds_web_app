const redis = require('redis');
const drizzle = require('drizzle-orm');

console.log('Redis exports:', Object.keys(redis));
console.log('Drizzle exports eq:', 'eq' in drizzle);
console.log('Drizzle exports:', Object.keys(drizzle).slice(0, 10)); // Just the first few
