/**
 * Legacy compatibility file proxy.
 *
 * Canonical route: /seaweed/{bucket}/{key}
 * Legacy alias: /minio/{bucket}/{key}
 */
export { GET } from '$lib/server/storage/seaweed-proxy.js';
