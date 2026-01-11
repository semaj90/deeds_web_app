/** * CUID (Collision Resistant Unique Identifier) utility * A simple implementation for generating unique identifiers */ let counter = 0;
let fingerprint: string;
/** * Generate a simple fingerprint for the process/session */ function getFingerprint(): string {
 if (!fingerprint) {
 fingerprint = Math.random().toString(36).substr(2, 8);
 }
 return fingerprint;
}
/** * Generate a timestamp-based component */ function getTimestamp(): string {
 return Date.now().toString(36);
}
/** * Generate a counter-based component */ function getCounter(): string {
 counter = (counter + 1) % 10000;
 return counter.toString(36).padStart(3, '0');
}
/** * Generate a random component */ function getRandom(): string {
 return Math.random().toString(36).substr(2, 8);
}
/** * Generate a CUID (Collision Resistant Unique Identifier) * Format: c + timestamp + counter + fingerprint + random */ export function cuid(): string {
 return 'c' + getTimestamp() + getCounter() + getFingerprint() + getRandom();
}
/** * Generate a slug version of CUID (shorter, URL-friendly) */ export function slug(): string {
 return getTimestamp().slice(-4) + getCounter() + getRandom().slice(0, 4);
}
export default cuid;
